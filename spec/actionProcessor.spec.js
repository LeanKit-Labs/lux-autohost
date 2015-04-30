describe( "actionProcessor.js", function() {
	var stub;
	describe( "when in exclude (default) filter mode", function() {
		before( function() {
			initLuxAh();
			stub = sinon.stub( global.lah.actionProcessor, "transition" );
			lah.config( {
				filter: {
					include: false,
					actions: [ "nopeNopeNope" ]
				}
			} );
		} );
		it( "should ignore excluded actions", function() {
			postal.publish( {
				channel: "lux.action",
				topic: "execute.nopeNopeNope",
				data: {
					actionType: "nopeNopeNope",
					actionArgs: []
				}
			} );
			stub.should.not.have.been.called;
		} );
	} );
	describe( "when in include filter mode", function() {
		before( function() {
			initLuxAh();
			stub = sinon.stub( global.lah.actionProcessor, "transition" );
			lah.config( {
				filter: {
					include: true,
					actions: [ "nopeNopeNope" ]
				}
			} );
		} );
		it( "should only monitor specified actions", function() {
			postal.publish( {
				channel: "lux.action",
				topic: "execute.nopeNopeNope",
				data: {
					actionType: "nopeNopeNope",
					actionArgs: []
				}
			} );
			stub.should.have.been.calledOnce;
		} );
	} );
	describe( "when processing an action", function() {
		var spy, meterMsg, timerMsg, sub, store;
		before( function( done ) {
			initLuxAh();
			store = new lux.Store( {
				namespace: "fakeyFakeFake",
				handlers: {
					nopeNopeNope: function() {}
				}
			} );
			spy = sinon.spy( global.lah.actionProcessor, "transition" );
			lah.config( {
				filter: {
					include: true,
					actions: [ "nopeNopeNope" ]
				}
			} );
			sub = postal.subscribe( {
				channel: "lux.action",
				topic: "execute.sendMetricsEntry",
				callback: function( data ) {
					if ( data.actionArgs[0].type === "meter" ) {
						meterMsg = true;
					}
					if ( data.actionArgs[0].type === "timer" ) {
						timerMsg = true;
					}
				}
			} );
			postal.publish( {
				channel: "lux.action",
				topic: "execute.nopeNopeNope",
				data: {
					actionType: "nopeNopeNope",
					actionArgs: []
				}
			} );
			global.lah.actionProcessor.on( "handled", function( data ) {
				if ( data.inputType === "action.complete" ) {
					done();
				}
			} );
		} );
		after( function() {
			sub.unsubscribe();
		} );
		it( "should move to processing when a monitored action executes", function() {
			spy.should.have.been.calledWith( "processing" );
		} );
		it( "should publish a count meter for the action", function() {
			meterMsg.should.be.true;
		} );
		it( "should publish a timer for the action when the dispatcher moves to ready state", function() {
			timerMsg.should.be.true;
		} );
	} );
} );
