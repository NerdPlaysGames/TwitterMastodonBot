'use strict';

exports.nfetch = async function nfetch(url, init) {
  const { default: fetch } = await import('node-fetch');
  let data = await fetch(url, init);
  return data;
};
