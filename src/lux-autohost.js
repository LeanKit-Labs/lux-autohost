/* global require, module */
/* jshint -W098 */
( function( root, factory ) {
	/* istanbul ignore next - don't test UMD wrapper */
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( [ "lux.js", "postal", "machina", "lodash", "moment" ], factory );
	} else if ( typeof module === "object" && module.exports ) {
		// Node, or CommonJS-Like environments
		module.exports = factory( require( "lux.js" ), require( "postal" ), require( "machina" ), require( "lodash" ), require( "moment" ) );
	} else {
		root.lux = factory( root.lux, root.postal, root.machina, root._, root.moment );
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

	//import("./loggingActionCreatorApi.js");
	//import("./metricsActionCreatorApi.js");
	//import("./batchManager.js");
	//import("./actionProcessor.js");

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
