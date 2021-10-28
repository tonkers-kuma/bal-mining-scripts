import { loadTree } from './merkle';
import { hexToBytes, toWei, soliditySha3 } from 'web3-utils';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { argv } = require('yargs');
const { liquidityMiningConfig } = require('./config');
const networks = ['homestead', 'homestead-lido'];

const ssb_dai = '0x9cfF0533972da48Ac05a00a375CC1a65e87Da7eC';
const ssb_usdt = '0x3ef6Ec70D4D8fE69365C92086d470bb7D5fC92Eb';
const ssb_usdc = '0x520BF095FA58cB3f68C18D01746041733A1f7b85';
const ssb_wbtc = '0x7c1612476D235c8054253c83B98f7Ca6f7F2E9D0';
const ssb_weth = '0xc31763c0c3025b9DF3Fb7Cb7f4AC041866F64F2E';
const ssb = [ssb_dai, ssb_usdt, ssb_usdc, ssb_wbtc, ssb_weth];

networks.forEach((network) => {
    const config = liquidityMiningConfig[network];
    console.log(`network ${network}`);
    console.log(config);
    const globCwd = path.resolve(__dirname, '../' + config.reportsDirectory);

    const filenamesOfTotals = glob.sync('./**/' + config.reportFilename, {
        cwd: globCwd,
    });
    const reports = filenamesOfTotals.map((fileName) => [
        parseInt(fileName.split('/')[1]), // weekNumber
        JSON.parse(fs.readFileSync(path.resolve(globCwd, fileName)).toString()),
    ]);

    console.log('Merkle roots');
    const claim_data = {};
    const tokens_data = [];
    const roots = {};

    reports.forEach(([week, report]) => {
        if (week != 73) return;
        config['week'] = week;
        claim_data['config'] = config;
        claim_data['token_data'] = tokens_data;
        const merkleTree = loadTree(report);
        console.log(`Week ${week}`);
        const root = merkleTree.getHexRoot();
        console.log(`Merkle Root ${root}`);
        // homestead started distributing using a merkle strategy 20 weeks in
        // so weeks prior to this offset should not be included
        if (config.offset < week) {
            roots[week - config.offset] = root;
        }

        ssb.forEach((address) => {
            const token_data = {};
            const claimable = report[address];
            if (claimable > 0) {
                const proof = merkleTree.getHexProof(
                    soliditySha3(address, toWei(claimable))
                );
                console.log(`Hex proof for ${address}`);
                console.log(proof);
                token_data['address'] = address;
                token_data['claim_amount'] = toWei(claimable);
                token_data['hex_proof'] = proof;
                tokens_data.push(token_data);
            }
        });
    });
    const claim_data_string = JSON.stringify(claim_data, null, 4);
    fs.writeFile(
        `../yearn/strategy-ssb/scripts/${network}.json`,
        claim_data_string,
        function (err) {
            if (err) {
                console.log(err);
            }
        }
    );
    if (argv.outfile) {
        const jsonString = JSON.stringify(roots, null, 4);
        console.log(jsonString);

        fs.writeFileSync(argv.outfile, jsonString);
    }
});
