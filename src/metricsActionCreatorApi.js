/* global lux, moment */
/* jshint -W098 */

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
