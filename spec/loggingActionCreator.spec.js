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
			getActionGroup: [ "logging" ]
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

	it( "should create the 'logging' action group in lux", function() {
		Object.keys( lux.getActionGroup( "logging" ) ).should.contain( "error", "warn", "info", "debug" );
	} );

	logLevels.forEach( function( level, index ) {
		describe( "Calling the " + level + " action", function() {
			before( function() {
				if ( console[level] ) {
					sinon.stub( console, level );
				}
			} );

			it( "should publish the action properly", function() {
				creator[ level ]( data );

				var now = moment.utc();

				function matcher( data ) {
					return moment( data ).diff( now, "ms" ) < 500;
				}

				listener.handlers.sendLogEntry.should.be.calledOnce.and.calledWith( sinon.match( {
					msg: data,
					type: level,
					level: index + 1,
					timestamp: sinon.match( matcher, "not within 500 ms" )
				} ) );
			} );

			after( function() {
				if ( console[level] ) {
					console[ level ].restore();
				}
			} );
		} );
	} );
} );
