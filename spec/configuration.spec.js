describe( "Configuration", function() {
	beforeEach( function() {
		initLuxAh();
	} );

	it( "should start with defaults", function() {
		global.lah.config().should.eql( {
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
		} );
	} );

	it( "should allow the action channel to be set", function() {
		global.lah.config( { actionChannel: postal.channel( "customChannel" ) } );
		global.lah.config().actionChannel.should.eql( postal.channel( "customChannel" ) );
	} );

	it( "should allow the metrics options to be set", function() {
		global.lah.config( {
			metrics: {
				messages: 4242,
				timeout: 42000
			}
		} );
		global.lah.config().metrics.should.eql( {
			messages: 4242,
			timeout: 42000
		} );
	} );

	it( "should allow the logging options to be set", function() {
		global.lah.config( {
			logging: {
				messages: 4242
			}
		} );
		global.lah.config().logging.should.eql( {
			messages: 4242,
			timeout: 5000
		} );
	} );
} );
