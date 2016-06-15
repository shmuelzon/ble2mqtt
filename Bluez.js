const events = require('events');
const debug = require('debug')('Bluez');
const bluezDBus = require('./BluezDBus');
const BluezAdapter = require('./BluezAdapter');

var bluez = new events.EventEmitter();

function interfaceAdded(path, objects) {
  /* We're only interested in Adapters */
  if (objects['org.bluez.Adapter1'] === undefined)
    return;

  debug('An adapter was added: ' + path);
  var adapter = new BluezAdapter(path);
  adapter.init((err) => {
    if (err) {
      debug('Failed initializing new adapter ' + path + ': ' + err);
      return;
    }
    bluez.emit('adapter', adapter);
  });
}

bluezDBus.getAllObjects(function(err, objects) {
  if (err)
    throw 'Failed getting all objects';

  Object.keys(objects).forEach((key) => interfaceAdded(key, objects[key]));
});

bluezDBus.onInterfaces(interfaceAdded);

module.exports = bluez;
