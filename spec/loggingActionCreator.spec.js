describe( "loggingActionCreatorApi", function() {
	var logLevels = [ "error", "warn", "info", "debug" ];
	var creator, listener, data;

	before( function() {
		initLuxAh();
		data = { test: "value" };

		listener = lux.actionListener( {
			handlers: {
				sendLogEntry: sinon.stub()
			}
		} );

		creator = lux.actionCreator( {
			getActions: [ "error", "warn", "info", "debug" ]
		} );
	} );

	after( function() {
		logLevels.forEach( function( level ) {
			delete lux.actions[ level ];
		} );

		listener.luxCleanup();
	} );

	afterEach( function() {
		listener.handlers.sendLogEntry.reset();
	} );

	it( "should add error, warn, info and debug action creator APIs to lux", function() {
		Object.keys( lux.actions ).should.contain( "error", "warn", "info", "debug" );
	} );

	logLevels.forEach( function( level, index ) {
		describe( "Calling the " + level + " action", function() {
			var existingLocation, existingNavigator;
			var testLocation = "http://localhost/test?queryString=1";
			var now;

			beforeEach( function() {
				if ( console[level] ) {
					sinon.stub( console, level );
				}

				existingLocation = window.location;
				existingNavigator = window.navigator;

				window.location = {
					href: testLocation
				};

				now = moment.utc();
			} );

			function matcher( data ) {
				return moment( data ).diff( now, "ms" ) < 500;
			}

			it( "should publish the action properly", function() {
				creator[ level ]( data );

				listener.handlers.sendLogEntry.should.be.calledOnce.and.calledWith( sinon.match( {
					namespace: "lux",
					msg: {
						data: data,
						location: testLocation,
						userAgent: window.navigator.userAgent
					},
					type: level,
					level: index + 1,
					timestamp: sinon.match( matcher, "not within 500 ms" )
				} ) );
			} );

			afterEach( function() {
				if ( console[level] ) {
					console[ level ].restore();
				}

				window.location = existingLocation;
				window.navigator = existingNavigator;
			} );
		} );
	} );
} );
