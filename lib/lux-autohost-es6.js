/**
 * lux-autohost - Action Creator API for submitting logging & metrics to autohost from lux.js apps.
 * Author: Jim Cowart
 * Version: v0.0.2
 * Url: https://github.com/LeanKit-Labs/lux-autohost
 * License(s): MIT Copyright (c) 2015 LeanKit
 */


( function( root, factory ) {
	/* istanbul ignore next - don't test UMD wrapper */
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( [ "lux.js", "postal", "machina", "lodash", "moment" ], factory );
	} else if ( typeof module === "object" && module.exports ) {
		// Node, or CommonJS-Like environments
		module.exports = factory( require( "lux.js" ), require( "postal" ), require( "machina" ), require( "lodash" ), require( "moment" ) );
	} else {
		root.luxah = factory( root.lux, root.postal, root.machina, root._, root.moment );
	}
}( this, function( lux, postal, machina, _, moment ) {
	var configuration = {
		actionChannel: postal.channel( "lux.action" ),
		filter: {
			include: false,
			actions: []
		},
		metrics: {
			timeout: 30000,
			messages: 500
		},
		logging: {
			timeout: 5000,
			messages: 25
		}
	};

	function config( options ) {
		if ( options ) {
			_.merge( configuration, options );
		}
		return configuration;
	}

	lux.customActionCreator( {
		sendLogBatch() {
			var args = Array.from( arguments );
			configuration.actionChannel.publish( {
				topic: "execute.sendLogBatch",
				data: {
					actionType: "sendLogBatch",
					actionArgs: args
				}
			} );
		},
		sendMetricsBatch() {
			var args = Array.from( arguments );
			configuration.actionChannel.publish( {
				topic: "execute.sendMetricsBatch",
				data: {
					actionType: "sendMetricsBatch",
					actionArgs: args
				}
			} );
		}
	} );

	

var logLevels = [ "error", "warn", "info", "debug" ];

function formatLogEntry( type, data ) {
	var msg = data;

	if ( window && window.location && window.navigator ) {
		msg = {
			data: data,
			location: window.location.href,
			userAgent: window.navigator.userAgent
		};
	}

	return {
		msg: msg,
		timestamp: moment.utc().toISOString(),
		type: type,
		level: logLevels.indexOf( type ) + 1
	};
}

function logIt( type, data ) {
	lux.publishAction( "sendLogEntry", formatLogEntry( type, data ) );
}

var loggingApi = _.reduce(
	logLevels,
	( acc, level ) => {
		acc[ level ] = function( data ) {
			return logIt( level, data );
		};
		return acc;
	},
	{}
);

lux.customActionCreator( loggingApi );

lux.addToActionGroup( "logging", logLevels );

	


// Need to figure out about custom metadata
function formatMetricsEntry( type, key, value, unit, data ) {
	return {
		type: type, // "time" | "meter" | [custom value]
		key: key, // your metric key
		timestamp: moment.utc().toISOString(),
		value: value,
		units: unit
	};
}

var metricsApi = {
	meter: function( key, value, unit, customData ) {
		lux.publishAction( "sendMetricsEntry", formatMetricsEntry( "meter", key, value, unit, customData ) );
	},
	timer: function( key, value, customData ) {
		lux.publishAction( "sendMetricsEntry", formatMetricsEntry( "timer", key, value, "ms", customData ) );
	}
};

lux.customActionCreator( metricsApi );

lux.addToActionGroup( "metrics", [ "meter", "timer" ] );

	


var metricsClient = {
	action: "sendMetricsBatch",
	queue: [],
	config: configuration.metrics
};
var loggingClient = {
	action: "sendLogBatch",
	queue: [],
	config: configuration.logging
};

var batchManager = new machina.BehavioralFsm( {
	initialState: "queueing",
	states: {
		// Might need an initializing state
		queueing: {
			_onEnter( client ) {
				client.timeout = setTimeout( () => this.handle( client, "transmit" ), client.config.timeout );
			},
			queueEntry( client, data ) {
				client.queue.push( data );
				if ( client.queue.length >= client.config.messages ) {
					this.transition( client, "transmitting" );
				}
			},
			transmit: "transmitting"
		},
		transmitting: {
			_onEnter( client ) {
				clearTimeout( client.timeout );
				this.handle( client, "transmit" );
			},
			transmit( client ) {
				if ( client.queue.length ) {
					var queue = client.queue;
					client.queue = [];
					lux.publishAction( client.action, queue );
				}
				this.transition( client, "queueing" );
			}
		}
	}
} );

var batchListener = lux.actionListener( {
	handlers: {
		sendLogEntry( data ) {
			batchManager.handle( loggingClient, "queueEntry", data );
		},
		sendMetricsEntry( data ) {
			batchManager.handle( metricsClient, "queueEntry", data );
		}
	}
} );

	


var ignoredActions = [ "sendLogEntry", "sendMetricsEntry", "sendLogBatch", "sendMetricsBatch" ];

function isMonitored( action ) {
	return ignoredActions.indexOf( action ) === -1 &&
		(
			( !configuration.filter.include && configuration.filter.actions.indexOf( action ) === -1 ) ||
			( configuration.filter.include && configuration.filter.actions.indexOf( action ) > -1 )
		);
}

function getContextKey() {
	var args = Array.from( arguments );
	var host;
	var path;
	if ( lux.getContextKey ) {
		return lux.getContextKey( ...arguments );
	} else {
		host = window.location.host.replace( /\./gi, "-" );
		path = window.location.pathname.replace( /\//ig, "-" );
		path = path[ 0 ] === "-" ? path.slice( 1 ) : path;
		return ( [ host, path ].concat( args ) ).join( "." );
	}
}

var actionProcessor = new machina.Fsm( {
	initialize: function() {
		lux.dispatcher.on( "handling", ( data ) => {
			if ( data.inputType === "action.dispatch" ) {
				this.handle( "start", data.client.action.actionType );
			}
		} );
		lux.dispatcher.on( "transition", ( data ) => {
			if ( data.toState === "ready" ) {
				this.handle( "dispatcher.complete" );
			}
		} );
	},
	initialState: "ready",
	states: {
		ready: {
			_onEnter() {
				this.current = {};
			},
			start( action ) {
				if ( isMonitored( action ) ) {
					this.current = {
						name: action,
						start: moment.utc(),
						key: getContextKey( action )
					};
					setTimeout( () => this.handle( "action.complete" ), 0 );
					this.transition( "processing" );
				}
			}
		},
		processing: {
			_onEnter() {
				// ( key, value, unit, customData )
				metricsApi.meter( this.current.key, 1, "count", {} );
			},
			"action.complete": "ready",
			"*": function() {
				this.deferUntilTransition();
			},
			_onExit() {
				// ( key, value, customData )
				metricsApi.timer( this.current.key, moment.utc().diff( this.current.start ), {} );
			}
		}
	}
} );


	// jshint ignore: start
	return {
		config,
		actionProcessor,
		batchManager,
		batchListener,
		metricsClient,
		loggingClient
	};
	// jshint ignore: end
} ) );
