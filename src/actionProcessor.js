/* global moment, postal, configuration, machina, metricsApi, lux */
/* jshint -W098 */

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
