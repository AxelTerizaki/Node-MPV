// Error Handler class
// This class is able to generate the proper error messages and deliver a JSON Object of the form
// {
// 	'errcode': numeric error code
// 	'verbose': verbal description matching the error code
// 	'method': method the error was raised in
// 	'arguments': if available, arguments the method was called with
// 	'errmessage': more specific error message
// 	'options': JSON object with valid argument options if the method was called with a wrong option
// }
//

interface ErrorObject {
	errcode: number,
	method: string,
	verbose: string,
	arguments?: any,
	errmessage?: string,
	options?: any
}

export default class ErrorHandler {
	// creates the error code table
	messageDict = {
		0: 'Unable to load file or stream',
		1: 'Invalid argument',
		2: 'Binary not found',
		3: 'ipcCommand invalid',
		4: 'Unable to bind IPC socket',
		5: 'Timeout',
		6: 'MPV is already running',
		7: 'Could not send IPC message',
		8: 'MPV is not running'
	}
	constructor () {

	}

	// creates the error message JSON object
	//
	// @param errorCode - the errorCode for the error
	// @param method - method this error is created/raised from
	// @param args (optional) - arguments that method was called with
	// @param errorMessage (optional) - specific error message
	// @param options (options) - valid arguments for the method that raised the error
	// 	ofthe form
	// {
	// 	'argument1': 'foo',
	// 	'argument2': 'bar'
	// }
	//
	// @return - JSON error object
	errorMessage(errorCode: number, method: string, args?: any, errorMessage?: string, options?: any): ErrorObject {

		// basic error object
		let errorObject: ErrorObject = {
			errcode: errorCode,
			verbose: this.messageDict[errorCode],
			method: method,
			arguments: args,
			errmessage: errorMessage,
			options: options
		};

		return errorObject;
	}

}
