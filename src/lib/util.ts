import execa from 'execa';
import {stat, Stats} from 'fs';
import {promisify} from 'util';
import {NodeMPVOptions, ObservedProperties} from '../../types/index';
import ErrorHandler from './error';

// These are utility functions for utilities (yes)
// Allows to promisify functions until everyone gets to Node 13+ and we can use promise-enabled fs functions.
function passThroughFunction(fn: any, args: any) {
	if(!Array.isArray(args)) args = [args];
	return promisify(fn)(...args);
};

async function asyncStat(...args: any): Promise<Stats> {
	return passThroughFunction(stat, args);
}

// Finds the correct command to start the IPC socket for mpv. It looks at the
// output of 'mpv --version' and uses Regular Expressions to determine the mpv
// version.
// With mpv version 0.17.0 the command changed from '--input-unix-socket' to
// '--input-ipc-server'
//
// @param options
// options object
//
// @ return {promise}
// Resolves to the command
//

export async function findIPCCommand(options: any): Promise<string> {
	// if the ipc Command was set by the user, use that
	if(options.ipc_command){
		// check if the command is correct
		if(!['--input-ipc-server', '--input-unix-socket'].includes(options.ipc_command)){
			throw new ErrorHandler().errorMessage(1, 'start()', [options.ipc_command],
				// error message
				`"${options.ipc_command}" is not a valid ipc command`,
				// argument options
				{
					'--input-unix-socket': 'mpv 0.16.0 and below',
					'--input-ipc-server':  'mpv 0.17.0 and above'
				}
			);
		} else {
			return options.ipc_command;
		}
	} else {
		// determine the ipc command according to the version number
		// the name of the ipc command was changed in mpv version 0.17.0 to '--input-ipc-server'
		// that's why we have to check which mpv version is running
		// asks for the mpv version
		try {
			const res = await execa(options.binary || 'mpv', ['--version'], {encoding: 'utf8'});
			// Version Number found
			if (res.stdout.match(/UNKNOWN/) === null) {
				// get the version part of the output
				// looking for mpv 0.XX.Y
				const regex_match = (res.stdout.match(/(mpv) \d+.\d+.\d+/));

				if(regex_match){
					const match = regex_match[0];
					// split at the whitespace to get the numbers
					// split at the dot and look at the middle one to check for the
					// critical version number
					const versionNumber = parseInt(match.split(' ')[1].split('.')[1]);
					if(versionNumber >= 17){
						// Version 0.17.0 and higher
						return '--input-ipc-server';
					}else{
						// Version 0.16.0 and below
						return '--input-unix-socket';
					}
				} else {
					// when MPV is built from source it sometimes has a git hash as
					// the version number
					// In this case assume it's a newer version and use the new command
					return '--input-ipc-server';
				}
			} else {
				// when compiling mpv from source the displayed version number is 'UNKNOWN'
				// I assume that version that is compiled from source is the latest version
				// and use the new command
				return '--input-ipc-server';
			}
		} catch(err) {
			// if any error occurs reject it
			throw err;
		}
	}
}

// Chcks if the  binary passed in by the user actually exists
// If nothing is passsed in the function is successfully resolved because
// 'mpv' will be used
//
// @param binary {string}
// Path to the mpv binary
//
// @return {promise}
//
export async function checkMpvBinary(binary: string) {
	if(binary){
		// check if the binary is actually working
		try {
			await asyncStat(binary);
		} catch(err) {
			throw new ErrorHandler().errorMessage(2, 'start()', [binary]);
		}
	}
	// if no binary is passed 'mpv' is used
}

// Merges the options input by the user with the default options, giving
// the user input options priority
//
// @param options
// node-mpv options object input by the user
//
// @ return
// Merged options object (UserInput with DefaultOptions)
//
export function mergeDefaultOptions(userInputOptions: NodeMPVOptions): NodeMPVOptions {
	// the default options to start the socket with
	const defaultOptions = {
		debug: false,
		verbose: false,
		// Windows and UNIX defaults
		socket: process.platform === 'win32' ? '\\\\.\\pipe\\mpvserver' : '/tmp/node-mpv.sock',
		audio_only: false,
		auto_restart: true,
		time_update: 1,
		binary: null
	};
	// merge the default options with the one specified by the user
	return {...defaultOptions, ...userInputOptions};
}

// Determies the properties observed by default
// If the player is NOT set to audio only, video properties are observed
// as well
//
// @param adioOnlyOption
// Flag if mpv should be started in audio only mode
//
// @return
// Observed properties object
//
export function observedProperties(audioOnlyOption: boolean): ObservedProperties {
	// basic observed properties
	let basicObserved = {
		mute: false,
		pause: false,
		duration: null,
		volume: 100,
		filename: null,
		path: null,
		'media-title': null,
		'playlist-pos': null,
		'playlist-count': null,
		loop: 'no'
	};

	// video related properties (not required in audio-only mode)
	const observedVideo = {
		fullscreen: false,
		'sub-visibility': false,
	};

	// add the video properties if not set to audio only
	if(!audioOnlyOption){
		basicObserved = {...basicObserved, ...observedVideo};
	}
	return basicObserved;
}

// Determines the arguments to start mpv with
// These consist of some default arguments and user input arguments
// @param options
// node-mpv options object
// @param userInputArguments
// mpv arguments input by the user
//
// @return
// list of arguments for mpv
export function mpvArguments(options: NodeMPVOptions, userInputArguments: string[]): string[] {
	// determine the IPC argument

	// default Arguments
	// --idle always run in the background
	// --really-quite  no console prompts. Buffer might overflow otherwise
	// --msg-level=ipc=v  sets IPC socket related messages to verbose
	let defaultArgs = ['--idle', '--really-quiet', '--msg-level=ipc=v'];

	//  audio_only option aditional arguments
	// --no-video  no video will be displayed
	// --audio-display  prevents album covers embedded in audio files from being displayed
	if(options.audio_only){
		defaultArgs = [...defaultArgs, ...['--no-video', '--no-audio-display']];
	}

	// add the user specified arguments if specified
	if(userInputArguments){
		// concats the arrays removing duplicates
		defaultArgs = [...new Set([...defaultArgs, ...userInputArguments])];
	}

	return defaultArgs;
}

// takes an options list consisting of strings of the following pattern
//      option=value
//   => ["option1=value1", "option2=value2"]
// and formats into a JSON object such that the mpv JSON api accepts it
//   => {"option1": "value1", "option2": "value2"}
// @param options
// list of options
//
// @return
// correctly formatted JSON object with the options
export function formatOptions(options: string[]): any {
	// JSON Options object
	let optionJSON = {};
	// each options is of the form options=value and has to be splited
	let splitted = [];
	// iterate through every options
	for(const i in options){
		// Splits only on the first = character
		splitted = options[i].split(/=(.+)/);
		optionJSON[splitted[0]] = splitted[1];
	}
	return optionJSON;
}

// searches the function stack for the topmost mpv function that was called
// and returns it
//
// @return
// name of the topmost mpv function on the function stack with added ()
// example: mute(), load() ...
export function getCaller(): string {
	// get the top most caller of the function stack for error message purposes
	const stackMatch  = new Error().stack.match(/at\s\w*[^getCaller]\.\w*\s/g);
	const caller = stackMatch[stackMatch.length-1].split('.')[1].trim() + '()';
	return caller;
}

