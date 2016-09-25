var jsdom = require( "jsdom" );
global.document = jsdom.jsdom( "<html><body></body></html>" );
global.window = document.defaultView;
global.BROWSER = false;
jsdom.changeURL( global.window, "http://localhost/test?queryString=1" );

require( "babel-polyfill" );
var chai = require( "chai" );
chai.use( require( "sinon-chai" ) );
global.should = chai.should();
global.proxyquire = require( "proxyquire" ).noPreserveCache().noCallThru();

global.postal = require( "postal" );
global.machina = require( "machina" );
global._ = require( "lodash" );
global.sinon = require( "sinon" );
global.moment = require( "moment" );
global.lux = undefined;
global.lah = undefined;

require( "babel-register" )( {
	only: /spec/
} );

global.initLuxAh = function() {
	if ( global.lah ) {
		global.lah.batchListener.luxCleanup();
	}

	if ( global.lux ) {
		global.lux.dispatcher.dispose();
	}

	global.lux = global.proxyquire( "lux.js", {} );
	global.lah = global.proxyquire( "../../lib/lux-autohost.js", {
		"lux.js": global.lux
	} );
};
