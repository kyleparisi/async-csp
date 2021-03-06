/* eslint-disable camelcase */

"use strict";

import fs from 'fs';
import Channel from '../../dist/channel.js';
let log = console.log.bind(console);

let input = './read.csv';
let output = './write.sql';

function now() {
    let time = process.hrtime();
    return (time[0] * 1e9 + time[1]) / 1e6;
}

export async function run() {

    let start = now();

    let makeArrays = new Channel(line => {
        line = line.trim();
        if (line) // drop empty lines from the channels
            return line.split(',').map(x => x.trim());
    });

    let makeObjects = new Channel(row => ({
        id          : row[0],
        first_name  : row[1],
        last_name   : row[2],
        email       : row[3],
        password    : row[4],
        country     : row[5],
        city        : row[6],
        state       : row[7],
        address     : row[8],
        post_code   : row[9]
    }));

    let prepend = 'INSERT INTO people (import_id, first_name, last_name, email, password) VALUES (';
    let append = ')\n';
    let makeStatements = new Channel(obj => {
        let out = [
            obj.id,
            `'${obj.first_name}'`,
            `'${obj.last_name}'`,
            `'${obj.email}'`,
            `'${obj.password}'`
        ];
        return prepend + out.join(', ') + append;
    });

    log(`Reading from ${input}...`);
    let fin = fs.createReadStream(input);

    let carry = null;
    fin.on('data', data => {
        // split input pipe on newlines
        let str = data.toString();
        let lines = str.split('\n');
        if (carry)
            lines[0] = carry + lines[0];
        for (let i = 0; i < lines.length - 1; i++) {
            let line = lines[i];
            makeArrays.put(line); // put each line on the makeArrays channel
        }
        carry = lines[lines.length - 1];
    });
    fin.on('end', () => {
        makeArrays.close(true); // trigger a full pipe close when read stream ends
    });

    let fout = fs.createWriteStream(output);
    makeStatements.consume(async sql => {
        if (!fout.write(sql)) {
            await new Promise(resolve => {
                fout.once('drain', resolve);
            });
        }
    });

    makeArrays
        .pipe(makeObjects)
        .pipe(makeStatements);
    await makeStatements.done();
    log(`Wrote statements to ${output}!`);
    let end = now();
    log(`Output took ${end - start}ms`);
}
