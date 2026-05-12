export namespace db {
	
	export class ActivityChange {
	    driver: boolean;
	    team: boolean;
	    card_present: boolean;
	    work_type: number;
	    minutes: number;
	
	    static createFrom(source: any = {}) {
	        return new ActivityChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.driver = source["driver"];
	        this.team = source["team"];
	        this.card_present = source["card_present"];
	        this.work_type = source["work_type"];
	        this.minutes = source["minutes"];
	    }
	}
	export class CardEvent {
	    kind: string;
	    type: number;
	    begin: string;
	    end: string;
	    vehicleRegistration: string;
	    vehicleNation: number;
	
	    static createFrom(source: any = {}) {
	        return new CardEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.type = source["type"];
	        this.begin = source["begin"];
	        this.end = source["end"];
	        this.vehicleRegistration = source["vehicleRegistration"];
	        this.vehicleNation = source["vehicleNation"];
	    }
	}
	export class DailyRecord {
	    activity_record_date: string;
	    activity_day_distance: number;
	    activity_change_info: ActivityChange[];
	
	    static createFrom(source: any = {}) {
	        return new DailyRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activity_record_date = source["activity_record_date"];
	        this.activity_day_distance = source["activity_day_distance"];
	        this.activity_change_info = this.convertValues(source["activity_change_info"], ActivityChange);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DriverProfile {
	    cardNumber: string;
	    surname?: string;
	    firstNames?: string;
	    issuingState: number;
	    firstSeenAt: string;
	    lastSeenAt: string;
	    importCount: number;
	    dailyRecordCount: number;
	    firstDate?: string;
	    lastDate?: string;
	    birthDate?: string;
	    cardIssueDate?: string;
	    cardExpiryDate?: string;
	
	    static createFrom(source: any = {}) {
	        return new DriverProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cardNumber = source["cardNumber"];
	        this.surname = source["surname"];
	        this.firstNames = source["firstNames"];
	        this.issuingState = source["issuingState"];
	        this.firstSeenAt = source["firstSeenAt"];
	        this.lastSeenAt = source["lastSeenAt"];
	        this.importCount = source["importCount"];
	        this.dailyRecordCount = source["dailyRecordCount"];
	        this.firstDate = source["firstDate"];
	        this.lastDate = source["lastDate"];
	        this.birthDate = source["birthDate"];
	        this.cardIssueDate = source["cardIssueDate"];
	        this.cardExpiryDate = source["cardExpiryDate"];
	    }
	}
	export class DriverSummary {
	    cardNumber: string;
	    surname?: string;
	    firstNames?: string;
	    issuingState: number;
	    firstSeenAt: string;
	    lastSeenAt: string;
	    importCount: number;
	    dailyRecordCount: number;
	    firstDate?: string;
	    lastDate?: string;
	
	    static createFrom(source: any = {}) {
	        return new DriverSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cardNumber = source["cardNumber"];
	        this.surname = source["surname"];
	        this.firstNames = source["firstNames"];
	        this.issuingState = source["issuingState"];
	        this.firstSeenAt = source["firstSeenAt"];
	        this.lastSeenAt = source["lastSeenAt"];
	        this.importCount = source["importCount"];
	        this.dailyRecordCount = source["dailyRecordCount"];
	        this.firstDate = source["firstDate"];
	        this.lastDate = source["lastDate"];
	    }
	}
	export class DriverVehicle {
	    firstUse: string;
	    lastUse: string;
	    registration: string;
	    nation: number;
	    odoBegin: number;
	    odoEnd: number;
	
	    static createFrom(source: any = {}) {
	        return new DriverVehicle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.firstUse = source["firstUse"];
	        this.lastUse = source["lastUse"];
	        this.registration = source["registration"];
	        this.nation = source["nation"];
	        this.odoBegin = source["odoBegin"];
	        this.odoEnd = source["odoEnd"];
	    }
	}
	export class GnssPoint {
	    timestamp: string;
	    latitude: number;
	    longitude: number;
	    odometer: number;
	
	    static createFrom(source: any = {}) {
	        return new GnssPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.latitude = source["latitude"];
	        this.longitude = source["longitude"];
	        this.odometer = source["odometer"];
	    }
	}
	export class ImportInfo {
	    id: number;
	    filename: string;
	    fileType: string;
	    fileSha256: string;
	    importedAt: string;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filename = source["filename"];
	        this.fileType = source["fileType"];
	        this.fileSha256 = source["fileSha256"];
	        this.importedAt = source["importedAt"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class ImportResult {
	    importId: number;
	    fileType: string;
	    driverCardNumber?: string;
	    alreadyImported: boolean;
	    filename: string;
	    counts: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.importId = source["importId"];
	        this.fileType = source["fileType"];
	        this.driverCardNumber = source["driverCardNumber"];
	        this.alreadyImported = source["alreadyImported"];
	        this.filename = source["filename"];
	        this.counts = source["counts"];
	    }
	}
	export class PlaceRecord {
	    entry_time: string;
	    entry_type_daily_work_period: number;
	    daily_work_period_country: number;
	    daily_work_period_region: number;
	    vehicle_odometer_value: number;
	
	    static createFrom(source: any = {}) {
	        return new PlaceRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entry_time = source["entry_time"];
	        this.entry_type_daily_work_period = source["entry_type_daily_work_period"];
	        this.daily_work_period_country = source["daily_work_period_country"];
	        this.daily_work_period_region = source["daily_work_period_region"];
	        this.vehicle_odometer_value = source["vehicle_odometer_value"];
	    }
	}
	export class WipeStats {
	    drivers: number;
	    vehicles: number;
	    imports: number;
	    dailyRecords: number;
	    placeRecords: number;
	    gnssPoints: number;
	    eventsFaults: number;
	    driverVehicles: number;
	
	    static createFrom(source: any = {}) {
	        return new WipeStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.drivers = source["drivers"];
	        this.vehicles = source["vehicles"];
	        this.imports = source["imports"];
	        this.dailyRecords = source["dailyRecords"];
	        this.placeRecords = source["placeRecords"];
	        this.gnssPoints = source["gnssPoints"];
	        this.eventsFaults = source["eventsFaults"];
	        this.driverVehicles = source["driverVehicles"];
	    }
	}

}

