# lux-autohost

## What is it?

lux-autohost provides two Action Creator API abstractions (for logging and metrics). These APIs provide developer-friendly (& expressive) methods that wrap the publishing of lux Action messages:

* Logging Action Creator API
	* `error( data )`
	* `warn( data )`
	* `info( data )`
	* `debug( data )`
* Metrics Action Creator API
	* `meter( key, value [, unit, customData ] )`
	* `timer( key, value [, customData ] )` (timer units are in ms)

In addition to these methods, lux-autohost transparently adds metrics-capture for any lux Action executed in the client. In other words, lux-autohost automatically starts count and timer metrics for every action (so you don't have to worry about that), and it provides the Action Creator APIs in case you have other custom metrics/logging you need to capture.

Logging and metric payloads will be batched and transmitted at the interval you specify (see below).

## Usage

### Configuring the interval(s)

Below is an example of configuring the intervals at which logging & metrics will be transmitted to the autohost resource endpoints. In this example, metrics-related messages will be transmitted every 30 seconds, or every 500 messages (whichever is reached first), and logging-related messages will be transmitted every 5 seconds, or every 25 messages.

```javascript
define([
	"lux-autohost"
], function( luxah ) {
	luxah.config({
		metrics: {
			timeout: 30000, // every 30 seconds...OR
			messages: 500   // every 500 messages
		},
		logging: {
			timeout: 5000, // every 5 seconds...OR
			messages: 25   // every 25 messages
		}
	});
});
```

### Configuring the whitelist/blacklist

By default, lux-autohost will wire up metrics on *every* action. You may have actions that you don't care about monitoring (for example: an action that fires any time a text input updates as a user types). You can choose to add actions to the blacklist, OR you can switch lux-autohost into whitelist mode, and only the actions specified will be monitored.

```javascript
define([
	"lux-autohost"
], function( luxah ) {
	luxah.config({
		filter: {
			whitelist: false, // default value is false, we blacklist by default
			actions: [ "someAction", "anotherAction" ]
		},
		// interval configuration example from above snippet
		// showing you can set all this config in one call
		metrics: {
			timeout: 30000, // every 30 seconds...OR
			messages: 500   // every 500 messages
		},
		logging: {
			timeout: 5000, // every 5 seconds...OR
			messages: 25   // every 25 messages
		}
	});
});
```

### Using the Action Creator APIs

#### Logging

Here's an example of a React component pulling in the `error`, `warn`, `info` and `debug` Action Creator API calls that are provided for logging.

```javascript
define( [
	"react",
	"lux.js",
], function( React, lux ) {
	var Component = React.createClass( {

		mixins: [ lux.reactMixin.actionCreator ],

		getActions: [ "error", "warn", "info", "debug" ],

		componentDidMount: function() {
			this.debug( "Yay! My component mounted." );
		},

		componentWillUnmount: function() {
			this.warn( "Sad times, my component is going to unmount." );
		},

		handleFatalError: function( data ) {
			this.error( data );
		},

		// more methods, etc.
	} );

	return Component;
} );

```

#### Metrics

Here's an example of a React component pulling in the `meter` and `timer` Action Creator API calls that are provided for metrics.

```javascript
define( [
	"react",
	"lux.js",
], function( React, lux ) {
	var Component = React.createClass( {

		mixins: [ lux.reactMixin.actionCreator ],

		getActions: [ "meter", "timer" ],

		componentDidMount: function() {
			this.meter("some.arbitrary.key", 1);
		},

		componentWillUnmount: function() {
			this.meter( "gauge.the.thing", -20 );
		},

		render: function() {
			var timer = this.timer( "pointless.render.timer" );
			// do render-y things
			timer.record();
		},

		// more methods, etc.
	} );

	return Component;
} );

```

### How Logging and Metrics Make it to autohost

