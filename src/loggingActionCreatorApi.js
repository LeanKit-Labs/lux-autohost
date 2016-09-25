/* global lux, moment, _ */

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
