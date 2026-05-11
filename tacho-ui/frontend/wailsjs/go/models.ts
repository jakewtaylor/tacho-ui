export namespace main {
	
	export class ParseResult {
	    filename: string;
	    fileType: string;
	    json: string;
	
	    static createFrom(source: any = {}) {
	        return new ParseResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.fileType = source["fileType"];
	        this.json = source["json"];
	    }
	}

}

