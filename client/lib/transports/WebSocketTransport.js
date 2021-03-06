'use strict';

const EventEmitter = require('events').EventEmitter;
const W3CWebSocket = require('websocket').w3cwebsocket;
const logger = require('../logger')('WebSocketTransport');
const Message = require('../Message');

const WS_SUBPROTOCOL = 'protoo';

class WebSocketTransport extends EventEmitter
{
	constructor(url, options)
	{
		logger.debug('constructor() [url:"%s", options:%o]', url, options);

		super();
		this.setMaxListeners(Infinity);

		// Save URL and options.
		this._url = url;
		this._options = options || {};

		// WebSocket instance.
		this._ws = null;

		// Closed flag.
		this._closed = false;

		// Set WebSocket
		this._setWebSocket();
	}

	get closed()
	{
		return this._closed;
	}

	send(message)
	{
		if (this._closed)
			return Promise.reject(new Error('transport closed'));

		try
		{
			this._ws.send(JSON.stringify(message));
			return Promise.resolve();
		}
		catch(error)
		{
			logger.error('send() | error sending message: %o', error);
			return Promise.reject(error);
		}
	}

	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		// Don't wait for the WebSocket 'close' event, do it now.
		this._closed = true;
		this.emit('close');

		try
		{
			this._ws.onopen = null;
			this._ws.onclose = null;
			this._ws.onerror = null;
			this._ws.onmessage = null;
			this._ws.close();
		}
		catch(error)
		{
			logger.error('close() | error closing the WebSocket: %o', error);
		}
	}

	_setWebSocket()
	{
		let options = this._options;

		this._ws = new W3CWebSocket(
			this._url,
			WS_SUBPROTOCOL,
			options.origin,
			options.headers,
			options.requestOptions,
			options.clientConfig
		);

		this._ws.onopen = () =>
		{
			if (this._closed)
				return;

			// Emit 'open' event.
			this.emit('open');
		};

		this._ws.onclose = (event) =>
		{
			if (this._closed)
				return;

			logger.error('WebSocket "close" event [wasClean:%s, code:%s, reason:"%s"]',
				event.wasClean, event.code, event.reason);

			this._closed = true;

			// Emit 'close' event.
			this.emit('close');

			// TODO: Should try to reconnect periodically.
		};

		this._ws.onerror = () =>
		{
			if (this._closed)
				return;

			logger.error('WebSocket "error" event');
		};

		this._ws.onmessage = (event) =>
		{
			if (this._closed)
				return;

			let message = Message.parse(event.data);

			if (!message)
				return;

			if (this.listenerCount('message') === 0)
			{
				logger.error('no listeners for WebSocket "message" event, ignoring received message');
				return;
			}

			// Emit 'message' event.
			this.emit('message', message);
		};
	}
}

module.exports = WebSocketTransport;
