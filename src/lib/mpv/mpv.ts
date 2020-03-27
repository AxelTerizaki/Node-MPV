// Child Process to module to start mpv player
import {Socket} from 'net';
// EventEmitter
import {EventEmitter} from 'events';

import commandModule from './_commands';
import controlModule from './_controls';
import eventModule from './_events';
import informationModule from  './_information';
import playlistModule from './_playlist';
import audioModule from './_audio';
import videoModule from './_video';
import subtitleModule from './_subtitle';
import startStopModule from './_startStop';


import ErrorHandler from '../error';
import ipcInterface from '../ipcInterface/ipcInterface';
import {mergeDefaultOptions, observedProperties, mpvArguments, getCaller, formatOptions} from '../util';
import { NodeMPVOptions, ObservedProperties, MPVLoadModes } from '../../../types';

// export the mpv class as the module
export default class mpv {

	options: NodeMPVOptions
	mpv_arguments: string[]
	observed: ObservedProperties
	observedIDs: any
	currentTimePos: number
	running: boolean
	errorHandler: any
	socket: any
	constructor(options: NodeMPVOptions, mpv_args: string[]) {
		// merge the user input options with the default options
		this.options = mergeDefaultOptions(options);
		// get the arguments to start mpv with
		this.mpv_arguments = mpvArguments(this.options, mpv_args);
		// observed properties
		// serves as a status object
		// can be enhanced by using the observeProperty function
		this.observed = observedProperties(this.options.audio_only);
		// intialize the event emitter
		EventEmitter.call(this);
		// saves the IDs of observedProperties with their propertyname
		// key:   id
		// value: property
		this.observedIDs = {};
		// timeposition of the current song
		this.currentTimePos = null;
		// states whether mpv is running or not
		this.running = false;

		// error handler
		this.errorHandler = new ErrorHandler();

		// set up the ipcInterface
		this.socket = new ipcInterface(this.options);
	}

	// loads a file into mpv
	// mode
	// replace          replace current video
	// append          append to playlist
	// append-play  append to playlist and play, if the playlist was empty
	//
	// options
	// further options

	load = async (file: string, mode: MPVLoadModes = 'replace', options: string[]) => {
		try {
			// check if this was called via load() or append() for error handling purposes
			const caller = getCaller();

			// reject if mpv is not running
			if (!this.running){
				throw this.errorHandler.errorMessage(8, caller, options ? [file, mode].concat(options) : [file, mode], null, {
					'replace': 'Replace the currently playing title',
					'append': 'Append the title to the playlist',
					'append-play': 'Append the title and when it is the only title in the list start playback'
				});
			}

			// reject the promise if the mode is not correct
			if(!['replace', 'append', 'append-play'].includes(mode)){
				throw this.errorHandler.errorMessage(1, caller, options ? [file, mode].concat(options) : [file, mode], null, {
					'replace': 'Replace the currently playing title',
					'append': 'Append the title to the playlist',
					'append-play': 'Append the title and when it is the only title in the list start playback'
				});
			} else {
				// socket to observe the command
				const observeSocket = new Socket();
				observeSocket.connect({path: this.options.socket}, async () => {
					// send the command to mpv
					await this.command('loadfile', options
						? [file, mode].concat(formatOptions(options))
						: [file, mode]
					);
					// get the playlist size
					const playlistSize = await this.getPlaylistSize();
					// if the mode is append resolve the promise because nothing
					// will be output by the mpv player
					// checking whether this file can be played or not is done when
					// the file is played
					if(mode === 'append'){
						observeSocket.destroy();
						return;
					}
					if (mode === 'append-play' && playlistSize > 1) {
						// if the mode is append-play and there are already songs in the playlist
						// resolve the promise since nothing will be output
						observeSocket.destroy();
						return;
					}

					// timeout
					let timeout = 0;
					// check if the file was started
					let started = false;

					observeSocket.on('data', data => {
						// increase timeout
						timeout += 1;
						// parse the messages from the socket
						const messages = data.toString('utf-8').split('\n');
						// check every message
						messages.forEach(messageStr => {
							// ignore empty messages
							if(messageStr.length > 0) {
								const message = JSON.parse(messageStr);
								if(message.event) {
									if(message.event === 'start-file'){
										started = true;
									} else if(message.event === 'file-loaded' && started){
										// when the file has successfully been loaded resolve the promise
										observeSocket.destroy();
										// resolve the promise
										return;
									}else if (message.event === 'end-file' && started){
										// when the track has changed we don't need a seek event
										observeSocket.destroy();
										throw this.errorHandler.errorMessage(0, caller, [file]);
									}
								}
							}
						});
						// reject the promise if it took to long until the playback-restart happens
						// to prevent having sockets listening forever
						if(timeout > 10){
							observeSocket.destroy();
							throw this.errorHandler.errorMessage(5, caller, [file]);
						}
					});
				});
			}
		} catch(err) {
			throw err;
		}
	}
}

mpv.prototype = Object.assign({
	constructor: mpv,



// add all the other modules
}, audioModule,
   controlModule,
   commandModule,
   eventModule,
   informationModule,
   playlistModule,
   startStopModule,
   subtitleModule,
   videoModule,
   // inherit from EventEmitter
   eventEmitter.prototype);


