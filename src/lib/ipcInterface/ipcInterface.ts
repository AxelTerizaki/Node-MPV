// This module handles the communication with MPV over the IPC socket created by
// the MPV player
//
// It listens to the socket, parses the messages and forwards them to the mpv
// module
//
// It also offers methods for the communication with mpv

// Network Sockets
import net, { Socket } from 'net';
// EventEmitter
import {EventEmitter} from 'events';
// Unique ID Library
import cuid from 'cuid';

import ErrorHandler from '../error';
import ipcRequest from './ipcRequest';
import {getCaller} from '../util';

interface ipcOptions {
	debug: boolean,
	socket: string,
	verbose: boolean
}

export default class ipcInterface extends EventEmitter {
	options: ipcOptions;
	socket: Socket;
	ipcRequests: any;
	errorHandler: ErrorHandler;
	constructor(options: any) {
		super();
		// save the options as member vars
		// Relevant for this module are
		//     debug:   debug option
		//     socket:  the socket path
		//     verbose: verbose option
		this.options = options;
		// dictionary to store the ipcRequest objects created for each request
		// it stores information about the request and wraps the promise reject
		// and resolve
		this.ipcRequests = {};

		// error handler
		this.errorHandler = new ErrorHandler();

		// intialize the event emitter
		EventEmitter.call(this);

		// Node Net Socket
		this.socket = new net.Socket();
	}
	// Thrown when the socket is closed by the other side
	// This function properly closes the socket by destroying it
	// Usually this will occur when MPV has crashed. The restarting is handled
	// by the mpv module, which will again recreate a socket
	//
	// Event: close
	closeHandler = () => {
		if (this.options.debug){
			console.log('Socket closed on the other side. This usually occurs \
						 when MPV has crashed');
		}
		// properly close the connection
		this.socket.destroy();
	}
	// Cathces any error thrown by the socket and outputs it to the console if
	// set to debug
	//
	// @param error {Object}
	// Errorobject from the socket
	//
	// Event: error
	errHandler = (error: any) => {
		if(this.options.debug){
			console.log(error);
		}
	}
	// Handles the data received by MPV over the ipc socket
	// MPV messages end with the \n character, this function splits it and for
	// each message received
	//
	// Request messages sent from the module to MPV are either resolved or rejected
	// Events are sent upward to the mpv module's event handler
	//
	// @param data {String}
	// Data from the socket
	//
	// Event: data
	dataHandler = (data: any) => {
		// various messages might be fetched at once
		let messages = data.toString().split('\n');

		// each message is emitted seperately
		messages.forEach((message: string) => {
			// empty messages may occur
			if(message.length > 0){
				const JSONmessage = JSON.parse(message);
				// if there was a request_id it was a request message
				if(JSONmessage.request_id && JSONmessage.request_id !== 0){
					// resolve promise
				 	if(JSONmessage.error === 'success'){
						// resolve the request
						this.ipcRequests[JSONmessage.request_id].resolve(JSONmessage.data);
						// delete the ipcRequest object
						delete this.ipcRequests[JSONmessage.request_id];
					} else {
						// reject the message's promise
						this.ipcRequests[JSONmessage.request_id].reject(JSONmessage.error);
						// delete the ipcRequest object
						delete this.ipcRequests[JSONmessage.request_id];
					}
				} else {
					// events are handled the old-fashioned way
					this.emit('message', JSON.parse(message));
				}
			}
		});
	}
	command = (command: string, args: any) => {
		// empty list if args was not set
		args = !args ? [] : args;
		// command list for the JSON command {'command': command_list}
		const command_list = [command, ...args];
		// send it over the socket
		return this.send(command_list);
	}
	// Sets a certain property of mpv
	// Formats the message in the correct JSON format
	//
	// @param property {String}
	// @param value {property dependant}
	//
	setProperty = (property: string, value: any) => {
		// command list for the JSON command {'command': command_list}
		const command_list = ['set_property', property, value];
		// send it over the socket
		return this.send(command_list);
	}
	// Adds to a certain property of mpv, for example volume
	// Formats the message in the correct JSON format
	//
	// @param property {String}
	// @param value {number}
	//
	addProperty = (property: string, value: number) => {
		// command list for the JSON command {'command': command_list}
		const command_list = ['add', property, value];
		// send it over the socket
		return this.send(command_list);
	}
	// Multiplies a certain property of mpv
	// Formats the message in the correct JSON format
	//
	// @param property {String}
	// @param value {number}
	//
	multiplyProperty = (property: string, value: number) => {
		// command list for the JSON command {'command': command_list}
		const command_list = ['multiply', property, value];
		// send it over the socket
		return this.send(command_list);
	}
	// Gets the value of a certain property of mpv
	// Formats the message in the correct JSON format
	//
	// The answer comes over a JSON message which triggers an event
	// Also resolved using promises
	//
	// @param property {String}
	// @param value {number}
	//
	getProperty = (property: string) => {
		// command list for the JSON command {'command': command_list}
		const command_list = ['get_property', property];
		// send it over the socket
		return this.send(command_list);
	}
	// Some mpv properties can be cycled, such as mute or fullscreen,
	// in which case this works like a toggle
	// Formats the message in the correct JSON format
	//
	// @param property {String}
	//
	cycleProperty = (property: string) => {
		// command list for the JSON command {'command': command_list}
		const command_list = ['cycle', property];
		// send it over the socket
		return this.send(command_list);
	}
	// Sends some arbitrary command to MPV
	//
	// @param command {String}
	//
	freeCommand = (command: string) => {
		try{
			this.socket.write(command + '\n');
		} catch(error) {
			console.log(`ERROR: MPV is not running - tried so send the message '${command}' over socket '${this.options.socket}'`);
		}
	}
	// starts the socket connection
	//
	// @param socket {String}
	//
	connect = (socket: string) => {
		// Connect to the socket specified in options
		this.socket.connect({path: socket}, () => {
			// Events
			// The event handler functions are defined in lib/ipcInterface/_events.js

			// Properly close the socket when it's closed from the other side
			this.socket.on('close', () => this.closeHandler());

			// Catch errors and output them if set to debug
			this.socket.on('error', error => this.errHandler(error));

			// Parse the data received from the socket and handle it to the mpv module
			this.socket.on('data', data => this.dataHandler(data));

			// partially 'fixes' the EventEmitter leak
			// the leaking listeners is 'close', but I did not yet find any solution to fix it
			this.socket.setMaxListeners(0);

			if(this.options.debug){
				console.log(`Connected to socket '${socket}'`);
			}
		});
	}
	// Closes the socket connection and removes all event listeners
	//
	quit = () => {
		// Remove all the event listeners
		this.socket.removeAllListeners('close');
		this.socket.removeAllListeners('error');
		this.socket.removeAllListeners('data');
		// Destroy the Net Socket
		this.socket.destroy();
	}
	// Sends message over the ipc socket and appends the \n character that
	// is required to end all messages to mpv
	// Prints an error message if MPV is not running
	//
	// Not supposed to be used from outside
	//
	// @param command {String}
	//
	send = async (command: any[]) => {
		// reject the promise if the socket is not running, this is only the case if the mpv player is not running
		if (this.socket.destroyed) throw this.errorHandler.errorMessage(8, getCaller());
		// create the unique ID
		const request_id = cuid();
		// create the JSON message object
		const messageJson = {
			command: command,
			request_id: request_id
		};
		// create an ipcRequest object to store the required information for error messages
		// put the resolve function in the ipcRequests dictionary to call it later
		this.ipcRequests[request_id] = new ipcRequest(Object.values(command).splice(1));
		try{
			this.socket.write(JSON.stringify(messageJson) + '\n');
			// Axel: Should we do this to avoid spamming the object properties once the socket has been sent ?
			delete this.ipcRequests[request_id];
		} catch(error) {
			// reject the promise in case of an error
			// Axel: what should be message here ? I don't get where it comes from
			throw this.ipcRequests[request_id].reject(this.errorHandler.errorMessage(7, message , 'send()', JSON.stringify(command)));
		}
	}
}


