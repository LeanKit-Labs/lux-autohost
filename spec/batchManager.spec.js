describe( "batchManager.js", function() {
	var clock;
	before( function() {
		clock = sinon.useFakeTimers();
	} );
	after( function() {
		clock.restore();
	} );
	describe( "when batching log entries", function() {
		var listener, creator;
		function sendLogMessage() {
			creator.info( "And now for some important info...." );
		}
		beforeEach( function() {
			initLuxAh();
			listener = global.lux.actionListener( {
				handlers: {
					sendLogBatch: sinon.stub(),
					sendLogEntry: sinon.stub()
				}
			} );
			creator = lux.actionCreator( { getActions: [ "error", "warn", "info", "debug" ] } );
			global.lah.loggingClient.queue = [];
		} );
		afterEach( function() {
			listener.luxCleanup();
		} );
		it( "should queue the entry if the threshold hasn't been reached", function() {
			sendLogMessage();
			listener.handlers.sendLogBatch.should.not.have.been.called;
			listener.handlers.sendLogEntry.should.have.been.calledOnce;
		} );
		it( "should publish a sendLogBatch action if the timeout threshold has been reached", function() {
			sendLogMessage();
			listener.handlers.sendLogEntry.should.have.been.calledOnce;
			clock.tick( 10000 );
			listener.handlers.sendLogBatch.should.have.been.called;
		} );
		it( "should publish a sendLogBatch action if the message count threshold has been reached", function() {
			var i = 25;
			while ( i ) {
				sendLogMessage();
				i--;
			}
			listener.handlers.sendLogEntry.callCount.should.equal( 25 );
			listener.handlers.sendLogBatch.should.have.been.called;
		} );
		it( "should empty the log queue once the batch has been sent", function() {
			var i = 25;
			while ( i ) {
				sendLogMessage();
				i--;
			}
			global.lah.loggingClient.queue.length.should.equal( 0 );
		} );
	} );
	describe( "when batching metrics entries", function() {
		var listener, creator;
		function sendMetricsMessages() {
			creator.meter( "some.random.key", 42 );
			creator.timer( "time.keeps.on.tickin", 42000 );
		}
		before( function() {
			initLuxAh();
		} );
		beforeEach( function() {
			listener = global.lux.actionListener( {
				handlers: {
					sendMetricsBatch: sinon.stub(),
					sendMetricsEntry: sinon.stub()
				}
			} );
			creator = lux.actionCreator( { getActions: [ "meter", "timer" ] } );
			global.lah.metricsClient.queue = [];
		} );
		afterEach( function() {
			listener.luxCleanup();
		} );

		it( "should queue the entry if the threshold hasn't been reached", function() {
			sendMetricsMessages();
			listener.handlers.sendMetricsBatch.should.not.have.been.called;
			listener.handlers.sendMetricsEntry.should.have.been.calledTwice;
		} );
		it( "should publish a sendMetricsBatch action if the timeout threshold has been reached", function() {
			sendMetricsMessages();
			listener.handlers.sendMetricsEntry.should.have.been.calledTwice;
			clock.tick( 35000 );
			listener.handlers.sendMetricsBatch.should.have.been.called;
		} );
		it( "should publish a sendMetricsBatch action if the message count threshold has been reached", function() {
			for ( var i = 0; i < 250; i++ ) {
				sendMetricsMessages();
			}
			listener.handlers.sendMetricsEntry.callCount.should.be.within( 500, 502 );
			listener.handlers.sendMetricsBatch.should.have.been.called;
		} );
		it( "should empty the metrics queue once the batch has been sent", function() {
			for ( var i = 0; i < 250; i++ ) {
				sendMetricsMessages();
			}
			global.lah.metricsClient.queue.length.should.equal( 0 );
		} );
	} );
} );
