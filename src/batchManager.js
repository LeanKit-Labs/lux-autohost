/* global lux, machina, postal, configuration */
/* jshint -W098 */

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
					lux.dispatch( client.action, queue );
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
