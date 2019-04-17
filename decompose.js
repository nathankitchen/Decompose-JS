const parse = require('csv-parse');
const fs = require('fs');

class DecomposerMath {

    static markup(price, markup) {
        return price * (1 + (markup / 100));
    }

    static reverseMarkup(price, markup) {
        return price / (1 + (markup / 100));
    }

    static margin(price, margin) {
        return price / (1 - (margin / 100));
    }

    static reverseMargin(price, margin) {
        return price * (1 - (margin / 100));
    }

    static dpToFactor(decimalPlaces) {
        return (decimalPlaces < 1) ? 1 : 10 ** Math.round(decimalPlaces);
    }

    static round(number, decimalPlaces) {
        var factor = DecomposerMath.dpToFactor(decimalPlaces);
        return Math.round(number * factor) / factor;
    }

    static ceiling(number, decimalPlaces) {
        var factor = DecomposerMath.dpToFactor(decimalPlaces);
        return Math.ceil(number * factor) / factor;
    }

    static floor(number, decimalPlaces) {
        var factor = DecomposerMath.dpToFactor(decimalPlaces);
        return Math.floor(number * factor) / factor;
    }
}

class DecomposerEngine {
    constructor(reverse, forward, decimalPlaces) {
        this.reverse = reverse;
        this.forward = forward;
        this.decimalPlaces = decimalPlaces;
    }

    run(price, rates, match) {
        var table = new Array();

        rates.forEach((rate) => {
            var reversedPriceMin = DecomposerMath.floor(this.reverse(price, rate), this.decimalPlaces);
            var reversedPriceMid = DecomposerMath.round(this.reverse(price, rate), this.decimalPlaces);
            var reversedPriceMax = DecomposerMath.ceiling(this.reverse(price, rate), this.decimalPlaces);

            var rebuiltPriceMin = DecomposerMath.round(this.forward(reversedPriceMin, rate), this.decimalPlaces);
            var rebuiltPriceMid = DecomposerMath.round(this.forward(reversedPriceMid, rate), this.decimalPlaces);
            var rebuiltPriceMax = DecomposerMath.round(this.forward(reversedPriceMax, rate), this.decimalPlaces);

            match({
                input: price,
                percent: rate,
                reversedMin: reversedPriceMin,
                reversedMid: reversedPriceMid,
                reversedMax: reversedPriceMax,
                rebuiltMin: rebuiltPriceMin,
                rebuiltMid: rebuiltPriceMid,
                rebuiltMax: rebuiltPriceMax
            });
        });
    }
}

class DecomposerRateIncrement {
    static get ONE() { return 100; }
    static get HALF() { return 50; }
    static get QUARTER() { return 25; }
    static get TENTH() { return 10; }
    static get TWENTIETH() { return 5; }
    static get HUNDREDTH() { return 1; }
}

class DecomposerSettings {
    get priceFilePath() { return this._priceFilePath; }
    set priceFilePath(path) { this._priceFilePath = path; }

    get columnNumber() { return this._priceFileColumnNumber; }
    set columnNumber(num) { this._priceFileColumnNumber = parseInt(num); }

    get decimalPlaces() { return this._decimalPlaces; }
    set decimalPlaces(dp) { this._decimalPlaces = parseInt(dp); }

    get startRate() { return this._startRate; }
    set startRate(start) { this._startRate = start; }

    get endRate() { return this._endRate; }
    set endRate(end) { this._endRate = end; }

    get incrementRate() { return this._incrementRate; }
    set incrementRate(inc) { this._incrementRate = inc; }

    get output() { return this._out; }
    set output(output) { this._out = output; }
}

class DecomposerSession {
    
    constructor(settings) {
        this._settings = settings;
    }

    start() {
        this._settings.output(`Parsing price file ${this._settings.priceFilePath} column ${this._settings.priceFileColumnNumber}...`);

        var rates = [];
        var results = [];

        var startRateScaled = this._settings.startRate * 100;
        var endRateScaled = this._settings.endRate * 100;

        for (var i=startRateScaled; i<=endRateScaled; i+= this._settings.incrementRate) {
            rates.push(i / 100);
            results.push(i / 100);
        }

        const parser = parse();
        parser.on('error', function (err) { console.error(err.message); } );
        parser.on('readable', function() {
            let record;

            const marginEngine = new DecomposerEngine(DecomposerMath.reverseMargin, DecomposerMath.margin, settings.decimalPlaces);
            const markupEngine = new DecomposerEngine(DecomposerMath.reverseMarkup, DecomposerMath.markup, settings.decimalPlaces);

            while (record = this.read()) {
                var price = parseFloat(record[priceColumn]);
                markupEngine.run(price, rates, (entry) => {
                    if ((entry.input != entry.rebuiltMin) && (entry.input != entry.rebuiltMax)) {
                        for (var i=0; i<results.length; i++) {
                            if (results[i] === entry.percent) {
                                results.splice(i, 1);
                            }
                        }
                    }
                });
            }
        });

        fs.createReadStream(priceFilePath)
            .pipe(parser)
            .on('end', () => {
                settings.output(JSON.stringify(results));
            });
    }
}

var args = process.argv.slice(2);
const priceFilePath = args[0];
const priceColumn = parseInt(args[1]);

const settings = new DecomposerSettings();
settings.priceFilePath = priceFilePath;
settings.priceFileColumnNumber = priceColumn;
settings.decimalPlaces = 2;
settings.startRate = 1;
settings.endRate = 25;
settings.incrementRate = DecomposerRateIncrement.HUNDREDTH;
settings.output = (msg) => { console.log(msg); };

const session = new DecomposerSession(settings);
session.start();