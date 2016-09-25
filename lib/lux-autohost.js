/**
 * lux-autohost - Action Creator API for submitting logging & metrics to autohost from lux.js apps.
 * Author: Jim Cowart
 * Version: v0.2.0
 * Url: https://github.com/LeanKit-Labs/lux-autohost
 * License(s): MIT Copyright (c) 2016 LeanKit
 */
var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function( obj ) {
		return typeof obj;
 } : function( obj ) {
		return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj;
 };

( function( root, factory ) {
	/* istanbul ignore next - don't test UMD wrapper */
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( [ "lux.js", "postal", "machina", "lodash", "moment" ], factory );
	} else if ( ( typeof module === "undefined" ? "undefined" : _typeof( module ) ) === "object" && module.exports ) {
		// Node, or CommonJS-Like environments
		module.exports = factory( require( "lux.js" ), require( "postal" ), require( "machina" ), require( "lodash" ), require( "moment" ) );
	} else {
		root.luxah = factory( root.lux, root.postal, root.machina, root._, root.moment );
	}
} )( undefined, function( lux, postal, machina, _, moment ) {
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
		sendLogBatch: function sendLogBatch() {
			var args = Array.from( arguments );
			configuration.actionChannel.publish( {
				topic: "execute.sendLogBatch",
				data: {
					actionType: "sendLogBatch",
					actionArgs: args
				}
			} );
		},
		sendMetricsBatch: function sendMetricsBatch() {
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
		var ns = lux.getLogNamespace ? lux.getLogNamespace( type, data ) : "lux";

		msg = {
			data: data,
			location: window.location.href,
			userAgent: window.navigator.userAgent
		};

		return {
			namespace: ns,
			msg: msg,
			timestamp: moment.utc().toISOString(),
			type: type,
			level: logLevels.indexOf( type ) + 1
		};
	}

	function logIt( type, data ) {
		lux.dispatch( "sendLogEntry", formatLogEntry( type, data ) );
	}

	var loggingApi = _.reduce( logLevels, function( acc, level ) {
		acc[level] = function( data ) {
			return logIt( level, data );
		};
		return acc;
	}, {} );

	lux.customActionCreator( loggingApi );

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
		meter: function meter( key, value, unit, customData ) {
			lux.dispatch( "sendMetricsEntry", formatMetricsEntry( "meter", key, value, unit, customData ) );
		},
		timer: function timer( key, value, customData ) {
			lux.dispatch( "sendMetricsEntry", formatMetricsEntry( "timer", key, value, "ms", customData ) );
		}
	};

	lux.customActionCreator( metricsApi );

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
				_onEnter: function _onEnter( client ) {
					var _this = this;

					client.timeout = setTimeout( function() {
						return _this.handle( client, "transmit" );
					}, client.config.timeout );
				},
				queueEntry: function queueEntry( client, data ) {
					client.queue.push( data );
					if ( client.queue.length >= client.config.messages ) {
						this.transition( client, "transmitting" );
					}
				},

				transmit: "transmitting"
			},
			transmitting: {
				_onEnter: function _onEnter( client ) {
					clearTimeout( client.timeout );
					this.handle( client, "transmit" );
				},
				transmit: function transmit( client ) {
					if ( client.queue.length ) {
						var queue = client.queue;
						client.queue = [];
						lux.dispatch( client.action, queue );
					}
					this.transition( client, "queueing" );
				}
			}
		}
	} );

	var batchListener = lux.actionListener( {
		handlers: {
			sendLogEntry: function sendLogEntry( data ) {
				batchManager.handle( loggingClient, "queueEntry", data );
			},
			sendMetricsEntry: function sendMetricsEntry( data ) {
				batchManager.handle( metricsClient, "queueEntry", data );
			}
		}
	} );

	var ignoredActions = [ "sendLogEntry", "sendMetricsEntry", "sendLogBatch", "sendMetricsBatch" ];

	function isMonitored( action ) {
		return ignoredActions.indexOf( action ) === -1 && ( !configuration.filter.include && configuration.filter.actions.indexOf( action ) === -1 || configuration.filter.include && configuration.filter.actions.indexOf( action ) > -1 );
	}

	function getContextKey() {
		var args = Array.from( arguments );
		var host;
		var path;
		if ( lux.getContextKey ) {
			return lux.getContextKey.apply( lux, arguments );
		} else {
			host = window.location.host.replace( /\./gi, "-" );
			path = window.location.pathname.replace( /\//ig, "-" );
			path = path[0] === "-" ? path.slice( 1 ) : path;
			return [ host, path ].concat( args ).join( "." );
		}
	}

	var actionProcessor = new machina.Fsm( {
		initialize: function initialize() {
			var _this2 = this;

			lux.dispatcher.on( "handling", function( data ) {
				if ( data.inputType === "action.dispatch" ) {
					_this2.handle( "start", data.client.action.actionType );
				}
			} );
			lux.dispatcher.on( "transition", function( data ) {
				if ( data.toState === "ready" ) {
					_this2.handle( "dispatcher.complete" );
				}
			} );
		},
		initialState: "ready",
		states: {
			ready: {
				_onEnter: function _onEnter() {
					this.current = {};
				},
				start: function start( action ) {
					var _this3 = this;

					if ( isMonitored( action ) ) {
						this.current = {
							name: action,
							start: moment.utc(),
							key: getContextKey( action )
						};
						setTimeout( function() {
							return _this3.handle( "action.complete" );
						}, 0 );
						this.transition( "processing" );
					}
				}
			},
			processing: {
				_onEnter: function _onEnter() {
					// ( key, value, unit, customData )
					metricsApi.meter( this.current.key, 1, "count", {} );
				},

				"action.complete": "ready",
				"*": function _() {
					this.deferUntilTransition();
				},
				_onExit: function _onExit() {
					// ( key, value, customData )
					metricsApi.timer( this.current.key, moment.utc().diff( this.current.start ), {} );
				}
			}
		}
	} );

	// jshint ignore: start
	return {
		config: config,
		actionProcessor: actionProcessor,
		batchManager: batchManager,
		batchListener: batchListener,
		metricsClient: metricsClient,
		loggingClient: loggingClient
	};
	// jshint ignore: end
} );
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImx1eC1hdXRvaG9zdC5qcyJdLCJuYW1lcyI6WyJyb290IiwiZmFjdG9yeSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwibHV4YWgiLCJsdXgiLCJwb3N0YWwiLCJtYWNoaW5hIiwiXyIsIm1vbWVudCIsImNvbmZpZ3VyYXRpb24iLCJhY3Rpb25DaGFubmVsIiwiY2hhbm5lbCIsImZpbHRlciIsImluY2x1ZGUiLCJhY3Rpb25zIiwibWV0cmljcyIsInRpbWVvdXQiLCJtZXNzYWdlcyIsImxvZ2dpbmciLCJjb25maWciLCJvcHRpb25zIiwibWVyZ2UiLCJjdXN0b21BY3Rpb25DcmVhdG9yIiwic2VuZExvZ0JhdGNoIiwiYXJncyIsIkFycmF5IiwiZnJvbSIsImFyZ3VtZW50cyIsInB1Ymxpc2giLCJ0b3BpYyIsImRhdGEiLCJhY3Rpb25UeXBlIiwiYWN0aW9uQXJncyIsInNlbmRNZXRyaWNzQmF0Y2giLCJsb2dMZXZlbHMiLCJmb3JtYXRMb2dFbnRyeSIsInR5cGUiLCJtc2ciLCJucyIsImdldExvZ05hbWVzcGFjZSIsImxvY2F0aW9uIiwid2luZG93IiwiaHJlZiIsInVzZXJBZ2VudCIsIm5hdmlnYXRvciIsIm5hbWVzcGFjZSIsInRpbWVzdGFtcCIsInV0YyIsInRvSVNPU3RyaW5nIiwibGV2ZWwiLCJpbmRleE9mIiwibG9nSXQiLCJkaXNwYXRjaCIsImxvZ2dpbmdBcGkiLCJyZWR1Y2UiLCJhY2MiLCJmb3JtYXRNZXRyaWNzRW50cnkiLCJrZXkiLCJ2YWx1ZSIsInVuaXQiLCJ1bml0cyIsIm1ldHJpY3NBcGkiLCJtZXRlciIsImN1c3RvbURhdGEiLCJ0aW1lciIsIm1ldHJpY3NDbGllbnQiLCJhY3Rpb24iLCJxdWV1ZSIsImxvZ2dpbmdDbGllbnQiLCJiYXRjaE1hbmFnZXIiLCJCZWhhdmlvcmFsRnNtIiwiaW5pdGlhbFN0YXRlIiwic3RhdGVzIiwicXVldWVpbmciLCJfb25FbnRlciIsImNsaWVudCIsInNldFRpbWVvdXQiLCJoYW5kbGUiLCJxdWV1ZUVudHJ5IiwicHVzaCIsImxlbmd0aCIsInRyYW5zaXRpb24iLCJ0cmFuc21pdCIsInRyYW5zbWl0dGluZyIsImNsZWFyVGltZW91dCIsImJhdGNoTGlzdGVuZXIiLCJhY3Rpb25MaXN0ZW5lciIsImhhbmRsZXJzIiwic2VuZExvZ0VudHJ5Iiwic2VuZE1ldHJpY3NFbnRyeSIsImlnbm9yZWRBY3Rpb25zIiwiaXNNb25pdG9yZWQiLCJnZXRDb250ZXh0S2V5IiwiaG9zdCIsInBhdGgiLCJyZXBsYWNlIiwicGF0aG5hbWUiLCJzbGljZSIsImNvbmNhdCIsImpvaW4iLCJhY3Rpb25Qcm9jZXNzb3IiLCJGc20iLCJpbml0aWFsaXplIiwiZGlzcGF0Y2hlciIsIm9uIiwiaW5wdXRUeXBlIiwidG9TdGF0ZSIsInJlYWR5IiwiY3VycmVudCIsInN0YXJ0IiwibmFtZSIsInByb2Nlc3NpbmciLCJkZWZlclVudGlsVHJhbnNpdGlvbiIsIl9vbkV4aXQiLCJkaWZmIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFFRSxXQUFVQSxJQUFWLEVBQWdCQyxPQUFoQixFQUEwQjtBQUMzQjtBQUNBLEtBQUssT0FBT0MsTUFBUCxLQUFrQixVQUFsQixJQUFnQ0EsT0FBT0MsR0FBNUMsRUFBa0Q7QUFDakQ7QUFDQUQsU0FBUSxDQUFFLFFBQUYsRUFBWSxRQUFaLEVBQXNCLFNBQXRCLEVBQWlDLFFBQWpDLEVBQTJDLFFBQTNDLENBQVIsRUFBK0RELE9BQS9EO0FBQ0EsRUFIRCxNQUdPLElBQUssUUFBT0csTUFBUCx5Q0FBT0EsTUFBUCxPQUFrQixRQUFsQixJQUE4QkEsT0FBT0MsT0FBMUMsRUFBb0Q7QUFDMUQ7QUFDQUQsU0FBT0MsT0FBUCxHQUFpQkosUUFBU0ssUUFBUyxRQUFULENBQVQsRUFBOEJBLFFBQVMsUUFBVCxDQUE5QixFQUFtREEsUUFBUyxTQUFULENBQW5ELEVBQXlFQSxRQUFTLFFBQVQsQ0FBekUsRUFBOEZBLFFBQVMsUUFBVCxDQUE5RixDQUFqQjtBQUNBLEVBSE0sTUFHQTtB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QUZPO0FBR2RVLFlBQUttQyxjQUFlMUIsTUFBZjtBQUhTLE9BQWY7QUFLQVUsaUJBQVk7QUFBQSxjQUFNLE9BQUtDLE1BQUwsQ0FBYSxpQkFBYixDQUFOO0FBQUEsT0FBWixFQUFvRCxDQUFwRDtBQUNBLFdBQUtJLFVBQUwsQ0FBaUIsWUFBakI7QUFDQTtBQUNEO0FBZEssSUFEQTtBQWlCUDhCLGVBQVk7QUFDWHJDLFlBRFcsc0JBQ0E7QUFDVjtBQUNBYixnQkFBV0MsS0FBWCxDQUFrQixLQUFLOEMsT0FBTCxDQUFhbkQsR0FBL0IsRUFBb0MsQ0FBcEMsRUFBdUMsT0FBdkMsRUFBZ0QsRUFBaEQ7QUFDQSxLQUpVOztBQUtYLHVCQUFtQixPQUxSO0FBTVgsU0FBSyxhQUFXO0FBQ2YsVUFBS3VELG9CQUFMO0FBQ0EsS0FSVTtBQVNYQyxXQVRXLHFCQVNEO0FBQ1Q7QUFDQXBELGdCQUFXRyxLQUFYLENBQWtCLEtBQUs0QyxPQUFMLENBQWFuRCxHQUEvQixFQUFvQ2pELE9BQU91QyxHQUFQLEdBQWFtRSxJQUFiLENBQW1CLEtBQUtOLE9BQUwsQ0FBYUMsS0FBaEMsQ0FBcEMsRUFBNkUsRUFBN0U7QUFDQTtBQVpVO0FBakJMO0FBZDhCLEVBQWpCLENBQXRCOztBQWlEQztBQUNBLFFBQU87QUFDTjFGLGdCQURNO0FBRU5pRixrQ0FGTTtBQUdOL0IsNEJBSE07QUFJTmdCLDhCQUpNO0FBS05wQiw4QkFMTTtBQU1ORztBQU5NLEVBQVA7QUFRQTtBQUNBLENBM1FDLENBQUYiLCJmaWxlIjoibHV4LWF1dG9ob3N0LmpzIiwic291cmNlc0NvbnRlbnQiOlsiXG5cbiggZnVuY3Rpb24oIHJvb3QsIGZhY3RvcnkgKSB7XG5cdC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0IC0gZG9uJ3QgdGVzdCBVTUQgd3JhcHBlciAqL1xuXHRpZiAoIHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kICkge1xuXHRcdC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cblx0XHRkZWZpbmUoIFsgXCJsdXguanNcIiwgXCJwb3N0YWxcIiwgXCJtYWNoaW5hXCIsIFwibG9kYXNoXCIsIFwibW9tZW50XCIgXSwgZmFjdG9yeSApO1xuXHR9IGVsc2UgaWYgKCB0eXBlb2YgbW9kdWxlID09PSBcIm9iamVjdFwiICYmIG1vZHVsZS5leHBvcnRzICkge1xuXHRcdC8vIE5vZGUsIG9yIENvbW1vbkpTLUxpa2UgZW52aXJvbm1lbnRzXG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCByZXF1aXJlKCBcImx1eC5qc1wiICksIHJlcXVpcmUoIFwicG9zdGFsXCIgKSwgcmVxdWlyZSggXCJtYWNoaW5hXCIgKSwgcmVxdWlyZSggXCJsb2Rhc2hcIiApLCByZXF1aXJlKCBcIm1vbWVudFwiICkgKTtcblx0fSBlbHNlIHtcblx0XHRyb290Lmx1eGFoID0gZmFjdG9yeSggcm9vdC5sdXgsIHJvb3QucG9zdGFsLCByb290Lm1hY2hpbmEsIHJvb3QuXywgcm9vdC5tb21lbnQgKTtcblx0fVxufSggdGhpcywgZnVuY3Rpb24oIGx1eCwgcG9zdGFsLCBtYWNoaW5hLCBfLCBtb21lbnQgKSB7XG5cdHZhciBjb25maWd1cmF0aW9uID0ge1xuXHRcdGFjdGlvbkNoYW5uZWw6IHBvc3RhbC5jaGFubmVsKCBcImx1eC5hY3Rpb25cIiApLFxuXHRcdGZpbHRlcjoge1xuXHRcdFx0aW5jbHVkZTogZmFsc2UsXG5cdFx0XHRhY3Rpb25zOiBbXVxuXHRcdH0sXG5cdFx0bWV0cmljczoge1xuXHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRtZXNzYWdlczogNTAwXG5cdFx0fSxcblx0XHRsb2dnaW5nOiB7XG5cdFx0XHR0aW1lb3V0OiA1MDAwLFxuXHRcdFx0bWVzc2FnZXM6IDI1XG5cdFx0fVxuXHR9O1xuXG5cdGZ1bmN0aW9uIGNvbmZpZyggb3B0aW9ucyApIHtcblx0XHRpZiAoIG9wdGlvbnMgKSB7XG5cdFx0XHRfLm1lcmdlKCBjb25maWd1cmF0aW9uLCBvcHRpb25zICk7XG5cdFx0fVxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uO1xuXHR9XG5cblx0bHV4LmN1c3RvbUFjdGlvbkNyZWF0b3IoIHtcblx0XHRzZW5kTG9nQmF0Y2goKSB7XG5cdFx0XHR2YXIgYXJncyA9IEFycmF5LmZyb20oIGFyZ3VtZW50cyApO1xuXHRcdFx0Y29uZmlndXJhdGlvbi5hY3Rpb25DaGFubmVsLnB1Ymxpc2goIHtcblx0XHRcdFx0dG9waWM6IFwiZXhlY3V0ZS5zZW5kTG9nQmF0Y2hcIixcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGFjdGlvblR5cGU6IFwic2VuZExvZ0JhdGNoXCIsXG5cdFx0XHRcdFx0YWN0aW9uQXJnczogYXJnc1xuXHRcdFx0XHR9XG5cdFx0XHR9ICk7XG5cdFx0fSxcblx0XHRzZW5kTWV0cmljc0JhdGNoKCkge1xuXHRcdFx0dmFyIGFyZ3MgPSBBcnJheS5mcm9tKCBhcmd1bWVudHMgKTtcblx0XHRcdGNvbmZpZ3VyYXRpb24uYWN0aW9uQ2hhbm5lbC5wdWJsaXNoKCB7XG5cdFx0XHRcdHRvcGljOiBcImV4ZWN1dGUuc2VuZE1ldHJpY3NCYXRjaFwiLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0YWN0aW9uVHlwZTogXCJzZW5kTWV0cmljc0JhdGNoXCIsXG5cdFx0XHRcdFx0YWN0aW9uQXJnczogYXJnc1xuXHRcdFx0XHR9XG5cdFx0XHR9ICk7XG5cdFx0fVxuXHR9ICk7XG5cblx0XG5cbnZhciBsb2dMZXZlbHMgPSBbIFwiZXJyb3JcIiwgXCJ3YXJuXCIsIFwiaW5mb1wiLCBcImRlYnVnXCIgXTtcblxuZnVuY3Rpb24gZm9ybWF0TG9nRW50cnkoIHR5cGUsIGRhdGEgKSB7XG5cdHZhciBtc2cgPSBkYXRhO1xuXHR2YXIgbnMgPSBsdXguZ2V0TG9nTmFtZXNwYWNlID8gbHV4LmdldExvZ05hbWVzcGFjZSggdHlwZSwgZGF0YSApIDogXCJsdXhcIjtcblxuXHRtc2cgPSB7XG5cdFx0ZGF0YTogZGF0YSxcblx0XHRsb2NhdGlvbjogd2luZG93LmxvY2F0aW9uLmhyZWYsXG5cdFx0dXNlckFnZW50OiB3aW5kb3cubmF2aWdhdG9yLnVzZXJBZ2VudFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0bmFtZXNwYWNlOiBucyxcblx0XHRtc2c6IG1zZyxcblx0XHR0aW1lc3RhbXA6IG1vbWVudC51dGMoKS50b0lTT1N0cmluZygpLFxuXHRcdHR5cGU6IHR5cGUsXG5cdFx0bGV2ZWw6IGxvZ0xldmVscy5pbmRleE9mKCB0eXBlICkgKyAxXG5cdH07XG59XG5cbmZ1bmN0aW9uIGxvZ0l0KCB0eXBlLCBkYXRhICkge1xuXHRsdXguZGlzcGF0Y2goIFwic2VuZExvZ0VudHJ5XCIsIGZvcm1hdExvZ0VudHJ5KCB0eXBlLCBkYXRhICkgKTtcbn1cblxudmFyIGxvZ2dpbmdBcGkgPSBfLnJlZHVjZShcblx0bG9nTGV2ZWxzLFxuXHQoIGFjYywgbGV2ZWwgKSA9PiB7XG5cdFx0YWNjWyBsZXZlbCBdID0gZnVuY3Rpb24oIGRhdGEgKSB7XG5cdFx0XHRyZXR1cm4gbG9nSXQoIGxldmVsLCBkYXRhICk7XG5cdFx0fTtcblx0XHRyZXR1cm4gYWNjO1xuXHR9LFxuXHR7fVxuKTtcblxubHV4LmN1c3RvbUFjdGlvbkNyZWF0b3IoIGxvZ2dpbmdBcGkgKTtcblxuXHRcblxuXG4vLyBOZWVkIHRvIGZpZ3VyZSBvdXQgYWJvdXQgY3VzdG9tIG1ldGFkYXRhXG5mdW5jdGlvbiBmb3JtYXRNZXRyaWNzRW50cnkoIHR5cGUsIGtleSwgdmFsdWUsIHVuaXQsIGRhdGEgKSB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogdHlwZSwgLy8gXCJ0aW1lXCIgfCBcIm1ldGVyXCIgfCBbY3VzdG9tIHZhbHVlXVxuXHRcdGtleToga2V5LCAvLyB5b3VyIG1ldHJpYyBrZXlcblx0XHR0aW1lc3RhbXA6IG1vbWVudC51dGMoKS50b0lTT1N0cmluZygpLFxuXHRcdHZhbHVlOiB2YWx1ZSxcblx0XHR1bml0czogdW5pdFxuXHR9O1xufVxuXG52YXIgbWV0cmljc0FwaSA9IHtcblx0bWV0ZXI6IGZ1bmN0aW9uKCBrZXksIHZhbHVlLCB1bml0LCBjdXN0b21EYXRhICkge1xuXHRcdGx1eC5kaXNwYXRjaCggXCJzZW5kTWV0cmljc0VudHJ5XCIsIGZvcm1hdE1ldHJpY3NFbnRyeSggXCJtZXRlclwiLCBrZXksIHZhbHVlLCB1bml0LCBjdXN0b21EYXRhICkgKTtcblx0fSxcblx0dGltZXI6IGZ1bmN0aW9uKCBrZXksIHZhbHVlLCBjdXN0b21EYXRhICkge1xuXHRcdGx1eC5kaXNwYXRjaCggXCJzZW5kTWV0cmljc0VudHJ5XCIsIGZvcm1hdE1ldHJpY3NFbnRyeSggXCJ0aW1lclwiLCBrZXksIHZhbHVlLCBcIm1zXCIsIGN1c3RvbURhdGEgKSApO1xuXHR9XG59O1xuXG5sdXguY3VzdG9tQWN0aW9uQ3JlYXRvciggbWV0cmljc0FwaSApO1xuXG5cdFxuXG5cbnZhciBtZXRyaWNzQ2xpZW50ID0ge1xuXHRhY3Rpb246IFwic2VuZE1ldHJpY3NCYXRjaFwiLFxuXHRxdWV1ZTogW10sXG5cdGNvbmZpZzogY29uZmlndXJhdGlvbi5tZXRyaWNzXG59O1xudmFyIGxvZ2dpbmdDbGllbnQgPSB7XG5cdGFjdGlvbjogXCJzZW5kTG9nQmF0Y2hcIixcblx0cXVldWU6IFtdLFxuXHRjb25maWc6IGNvbmZpZ3VyYXRpb24ubG9nZ2luZ1xufTtcblxudmFyIGJhdGNoTWFuYWdlciA9IG5ldyBtYWNoaW5hLkJlaGF2aW9yYWxGc20oIHtcblx0aW5pdGlhbFN0YXRlOiBcInF1ZXVlaW5nXCIsXG5cdHN0YXRlczoge1xuXHRcdC8vIE1pZ2h0IG5lZWQgYW4gaW5pdGlhbGl6aW5nIHN0YXRlXG5cdFx0cXVldWVpbmc6IHtcblx0XHRcdF9vbkVudGVyKCBjbGllbnQgKSB7XG5cdFx0XHRcdGNsaWVudC50aW1lb3V0ID0gc2V0VGltZW91dCggKCkgPT4gdGhpcy5oYW5kbGUoIGNsaWVudCwgXCJ0cmFuc21pdFwiICksIGNsaWVudC5jb25maWcudGltZW91dCApO1xuXHRcdFx0fSxcblx0XHRcdHF1ZXVlRW50cnkoIGNsaWVudCwgZGF0YSApIHtcblx0XHRcdFx0Y2xpZW50LnF1ZXVlLnB1c2goIGRhdGEgKTtcblx0XHRcdFx0aWYgKCBjbGllbnQucXVldWUubGVuZ3RoID49IGNsaWVudC5jb25maWcubWVzc2FnZXMgKSB7XG5cdFx0XHRcdFx0dGhpcy50cmFuc2l0aW9uKCBjbGllbnQsIFwidHJhbnNtaXR0aW5nXCIgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHRyYW5zbWl0OiBcInRyYW5zbWl0dGluZ1wiXG5cdFx0fSxcblx0XHR0cmFuc21pdHRpbmc6IHtcblx0XHRcdF9vbkVudGVyKCBjbGllbnQgKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCggY2xpZW50LnRpbWVvdXQgKTtcblx0XHRcdFx0dGhpcy5oYW5kbGUoIGNsaWVudCwgXCJ0cmFuc21pdFwiICk7XG5cdFx0XHR9LFxuXHRcdFx0dHJhbnNtaXQoIGNsaWVudCApIHtcblx0XHRcdFx0aWYgKCBjbGllbnQucXVldWUubGVuZ3RoICkge1xuXHRcdFx0XHRcdHZhciBxdWV1ZSA9IGNsaWVudC5xdWV1ZTtcblx0XHRcdFx0XHRjbGllbnQucXVldWUgPSBbXTtcblx0XHRcdFx0XHRsdXguZGlzcGF0Y2goIGNsaWVudC5hY3Rpb24sIHF1ZXVlICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy50cmFuc2l0aW9uKCBjbGllbnQsIFwicXVldWVpbmdcIiApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSApO1xuXG52YXIgYmF0Y2hMaXN0ZW5lciA9IGx1eC5hY3Rpb25MaXN0ZW5lcigge1xuXHRoYW5kbGVyczoge1xuXHRcdHNlbmRMb2dFbnRyeSggZGF0YSApIHtcblx0XHRcdGJhdGNoTWFuYWdlci5oYW5kbGUoIGxvZ2dpbmdDbGllbnQsIFwicXVldWVFbnRyeVwiLCBkYXRhICk7XG5cdFx0fSxcblx0XHRzZW5kTWV0cmljc0VudHJ5KCBkYXRhICkge1xuXHRcdFx0YmF0Y2hNYW5hZ2VyLmhhbmRsZSggbWV0cmljc0NsaWVudCwgXCJxdWV1ZUVudHJ5XCIsIGRhdGEgKTtcblx0XHR9XG5cdH1cbn0gKTtcblxuXHRcblxuXG52YXIgaWdub3JlZEFjdGlvbnMgPSBbIFwic2VuZExvZ0VudHJ5XCIsIFwic2VuZE1ldHJpY3NFbnRyeVwiLCBcInNlbmRMb2dCYXRjaFwiLCBcInNlbmRNZXRyaWNzQmF0Y2hcIiBdO1xuXG5mdW5jdGlvbiBpc01vbml0b3JlZCggYWN0aW9uICkge1xuXHRyZXR1cm4gaWdub3JlZEFjdGlvbnMuaW5kZXhPZiggYWN0aW9uICkgPT09IC0xICYmXG5cdFx0KFxuXHRcdFx0KCAhY29uZmlndXJhdGlvbi5maWx0ZXIuaW5jbHVkZSAmJiBjb25maWd1cmF0aW9uLmZpbHRlci5hY3Rpb25zLmluZGV4T2YoIGFjdGlvbiApID09PSAtMSApIHx8XG5cdFx0XHQoIGNvbmZpZ3VyYXRpb24uZmlsdGVyLmluY2x1ZGUgJiYgY29uZmlndXJhdGlvbi5maWx0ZXIuYWN0aW9ucy5pbmRleE9mKCBhY3Rpb24gKSA+IC0xIClcblx0XHQpO1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0S2V5KCkge1xuXHR2YXIgYXJncyA9IEFycmF5LmZyb20oIGFyZ3VtZW50cyApO1xuXHR2YXIgaG9zdDtcblx0dmFyIHBhdGg7XG5cdGlmICggbHV4LmdldENvbnRleHRLZXkgKSB7XG5cdFx0cmV0dXJuIGx1eC5nZXRDb250ZXh0S2V5KCAuLi5hcmd1bWVudHMgKTtcblx0fSBlbHNlIHtcblx0XHRob3N0ID0gd2luZG93LmxvY2F0aW9uLmhvc3QucmVwbGFjZSggL1xcLi9naSwgXCItXCIgKTtcblx0XHRwYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnJlcGxhY2UoIC9cXC8vaWcsIFwiLVwiICk7XG5cdFx0cGF0aCA9IHBhdGhbIDAgXSA9PT0gXCItXCIgPyBwYXRoLnNsaWNlKCAxICkgOiBwYXRoO1xuXHRcdHJldHVybiAoIFsgaG9zdCwgcGF0aCBdLmNvbmNhdCggYXJncyApICkuam9pbiggXCIuXCIgKTtcblx0fVxufVxuXG52YXIgYWN0aW9uUHJvY2Vzc29yID0gbmV3IG1hY2hpbmEuRnNtKCB7XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuXHRcdGx1eC5kaXNwYXRjaGVyLm9uKCBcImhhbmRsaW5nXCIsICggZGF0YSApID0+IHtcblx0XHRcdGlmICggZGF0YS5pbnB1dFR5cGUgPT09IFwiYWN0aW9uLmRpc3BhdGNoXCIgKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlKCBcInN0YXJ0XCIsIGRhdGEuY2xpZW50LmFjdGlvbi5hY3Rpb25UeXBlICk7XG5cdFx0XHR9XG5cdFx0fSApO1xuXHRcdGx1eC5kaXNwYXRjaGVyLm9uKCBcInRyYW5zaXRpb25cIiwgKCBkYXRhICkgPT4ge1xuXHRcdFx0aWYgKCBkYXRhLnRvU3RhdGUgPT09IFwicmVhZHlcIiApIHtcblx0XHRcdFx0dGhpcy5oYW5kbGUoIFwiZGlzcGF0Y2hlci5jb21wbGV0ZVwiICk7XG5cdFx0XHR9XG5cdFx0fSApO1xuXHR9LFxuXHRpbml0aWFsU3RhdGU6IFwicmVhZHlcIixcblx0c3RhdGVzOiB7XG5cdFx0cmVhZHk6IHtcblx0XHRcdF9vbkVudGVyKCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnQgPSB7fTtcblx0XHRcdH0sXG5cdFx0XHRzdGFydCggYWN0aW9uICkge1xuXHRcdFx0XHRpZiAoIGlzTW9uaXRvcmVkKCBhY3Rpb24gKSApIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnQgPSB7XG5cdFx0XHRcdFx0XHRuYW1lOiBhY3Rpb24sXG5cdFx0XHRcdFx0XHRzdGFydDogbW9tZW50LnV0YygpLFxuXHRcdFx0XHRcdFx0a2V5OiBnZXRDb250ZXh0S2V5KCBhY3Rpb24gKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0c2V0VGltZW91dCggKCkgPT4gdGhpcy5oYW5kbGUoIFwiYWN0aW9uLmNvbXBsZXRlXCIgKSwgMCApO1xuXHRcdFx0XHRcdHRoaXMudHJhbnNpdGlvbiggXCJwcm9jZXNzaW5nXCIgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cHJvY2Vzc2luZzoge1xuXHRcdFx0X29uRW50ZXIoKSB7XG5cdFx0XHRcdC8vICgga2V5LCB2YWx1ZSwgdW5pdCwgY3VzdG9tRGF0YSApXG5cdFx0XHRcdG1ldHJpY3NBcGkubWV0ZXIoIHRoaXMuY3VycmVudC5rZXksIDEsIFwiY291bnRcIiwge30gKTtcblx0XHRcdH0sXG5cdFx0XHRcImFjdGlvbi5jb21wbGV0ZVwiOiBcInJlYWR5XCIsXG5cdFx0XHRcIipcIjogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHRoaXMuZGVmZXJVbnRpbFRyYW5zaXRpb24oKTtcblx0XHRcdH0sXG5cdFx0XHRfb25FeGl0KCkge1xuXHRcdFx0XHQvLyAoIGtleSwgdmFsdWUsIGN1c3RvbURhdGEgKVxuXHRcdFx0XHRtZXRyaWNzQXBpLnRpbWVyKCB0aGlzLmN1cnJlbnQua2V5LCBtb21lbnQudXRjKCkuZGlmZiggdGhpcy5jdXJyZW50LnN0YXJ0ICksIHt9ICk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59ICk7XG5cblxuXHQvLyBqc2hpbnQgaWdub3JlOiBzdGFydFxuXHRyZXR1cm4ge1xuXHRcdGNvbmZpZyxcblx0XHRhY3Rpb25Qcm9jZXNzb3IsXG5cdFx0YmF0Y2hNYW5hZ2VyLFxuXHRcdGJhdGNoTGlzdGVuZXIsXG5cdFx0bWV0cmljc0NsaWVudCxcblx0XHRsb2dnaW5nQ2xpZW50XG5cdH07XG5cdC8vIGpzaGludCBpZ25vcmU6IGVuZFxufSApICk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
