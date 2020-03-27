export interface NodeMPVOptions {
	debug: boolean
	verbose: boolean
	socket: string
	audio_only: boolean
	auto_restart: boolean
	time_update: number
	binary: string
}

export interface ObservedProperties {
	mute: boolean,
	pause: boolean,
	duration: number,
	volume: number,
	filename: string,
	path: string,
	'media-title': string,
	'playlist-pos': number,
	'playlist-count': number,
	loop: string,
	fullscreen?: boolean,
	'sub-visibility'?: boolean
}

export type MPVLoadModes = 'replace' |  'append' | 'append-play'