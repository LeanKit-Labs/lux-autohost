describe( "metricsActionCreatorApi.js", function() {
	var creator, listener;

	before( function() {
		listener = lux.actionListener( {
			handlers: {
				sendMetricsEntry: sinon.stub()
			}
		} );

		creator = lux.actionCreator( {
			getActionGroup: [ "metrics" ]
		} );
	} );

	after( function() {
		delete lux.actions.meter;
		delete lux.actions.timer;
		listener.luxCleanup();
	} );

	afterEach( function() {
		listener.handlers.sendMetricsEntry.reset();
	} );

	it( "should add meter & timer action creator APIs to lux", function() {
		Object.keys( lux.actions ).should.contain( "meter", "timer" );
	} );

	it( "should create the 'metrics' action group in lux", function() {
		Object.keys( lux.getActionGroup( "metrics" ) ).should.contain( "meter", "timer" );
	} );

	describe( "when capturing a meter", function() {
		it( "should publish a sendMetrics action message", function() {
			var now = moment.utc();

			function matcher( data ) {
				return moment( data ).diff( now, "ms" ) < 500;
			}
			creator.meter( "these.go.to", 11, "volume" );

			listener.handlers.sendMetricsEntry.should.be.calledOnce.and.calledWith( sinon.match( {
				type: "meter",
				key: "these.go.to",
				timestamp: sinon.match( matcher, "not within 500 ms" ),
				value: 11,
				units: "volume"
			} ) );
		} );
	} );
	describe( "when capturing a timer", function() {
		it( "should publish a sendMetrics action message", function() {
			var now = moment.utc();

			function matcher( data ) {
				return moment( data ).diff( now, "ms" ) < 500;
			}
			creator.timer( "this.is.sparta", 300 );

			listener.handlers.sendMetricsEntry.should.be.calledOnce.and.calledWith( sinon.match( {
				type: "timer",
				key: "this.is.sparta",
				timestamp: sinon.match( matcher, "not within 500 ms" ),
				value: 300,
				units: "ms"
			} ) );
		} );
	} );
} );
