var jsdom = require( "jsdom" ).jsdom;
global.document = jsdom( "<html><body></body></html>" );
global.window = document.parentWindow;

require( "babel/polyfill" );
var chai = require( "chai" );
chai.use( require( "sinon-chai" ) );
global.should = chai.should();
global.proxyquire = require( "proxyquire" ).noPreserveCache();

global.postal = require( "postal" );
global.machina = require( "machina" );
global._ = require( "lodash" );
global.sinon = require( "sinon" );
global.moment = require( "moment" );
global.lux = undefined;
global.lah = undefined;

require( "babel/register" )( {
	only: /spec/
} );

global.initLuxAh = function() {
	global.lux = global.proxyquire( "lux.js", {}	);
	global.lah = global.proxyquire( "../../lib/lux-autohost.js", {
		"lux.js": global.lux
	} );
};
