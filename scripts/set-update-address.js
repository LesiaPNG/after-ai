/* Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only */
'use strict';
const fs=require('fs'),path=require('path');
const url=new URL(process.argv[2]);if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Pass a public site URL without credentials or query parameters');
const manifestUrl=new URL('/updates/experimental.json',url).href;
fs.writeFileSync(path.join(__dirname,'../updates/location.json'),JSON.stringify({manifestUrl},null,2)+'\n');
console.log('Updated the public server pointer. Commit and push updates/location.json to activate it.');
