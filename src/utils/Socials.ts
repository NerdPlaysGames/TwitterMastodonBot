
import { createReadStream, readFile, readSync } from 'fs';
import { Mastodon } from 'megalodon';
import { TwitterApi } from 'twitter-api-v2';

// Mastodon
const mastodonClient = new Mastodon(`https://${process.env.mastodon_host}`, process.env.mastodon_access_token);

// Twitter
const twitterClient = new TwitterApi({
  appKey: process.env.twitter_consumer_key,
  appSecret: process.env.twitter_consumer_secret,
  accessToken: process.env.twitter_access_token,
  accessSecret: process.env.twitter_access_token_secret
});

async function postToMastodon(text: string, media?: string) {
  if (text.length > 500) {
    const threads = splitToThread(text, 500);
    // Post as replies to the above thread
    let lastPost;
    for (let i = 0; i < threads.length; i++) {
      if (lastPost) {
        let post = await mastodonClient.postStatus(threads[i], { visibility: 'public', in_reply_to_id: lastPost })
        lastPost = post.data.id
      } else {
        if (media) {
          let mediaFile = createReadStream(media);
          let mediaID = (await mastodonClient.uploadMedia(mediaFile)).data.id;
          let post = await mastodonClient.postStatus(threads[i], { visibility: 'public', media_ids: [mediaID] });
          lastPost = post.data.id
        } else {
          let post = await mastodonClient.postStatus(threads[i], { visibility: 'public' });
          lastPost = post.data.id
        }
      }
    }
  } else {
    if (media) {
      let mediaFile = await createReadStream(media);
      let mediaID = (await mastodonClient.uploadMedia(mediaFile)).data.id;
      console.log(mediaID);
      await mastodonClient.postStatus(text, { visibility: 'public', media_ids: [mediaID] });
    } else {
      await mastodonClient.postStatus(text, { visibility: 'public'});
    }
  }
}

async function postToTwitter(text: string, media?: string) {
  if (text.length > 280) {
    const threads = splitToThread(text, 280);
    // Post as replies to the above thread
    let lastPost;
    for (let i = 0; i < threads.length; i++) {
      if (lastPost) {
        let post = await twitterClient.v2.reply(threads[i], lastPost)
        lastPost = post.data.id
      } else {
        if (media && i === 0) {
          let mediaFile = await twitterClient.v1.uploadMedia(media);
          let post = await twitterClient.v2.tweet(threads[i], {media: { media_ids:[mediaFile]}})
          lastPost = post.data.id
        } else {
          let post = await twitterClient.v2.tweet(threads[i])
          lastPost = post.data.id
        }
      }
    }
  } else {
    if (media) {
      let mediaFile = await twitterClient.v1.uploadMedia(media);
      await twitterClient.v2.tweet(text, { media: { media_ids: [mediaFile] }});
    } else {
      await twitterClient.v2.tweet(text);
    }
  }
}

async function postToAll(text: string, media?: string) {
  if (media) {
    await Promise.all([postToMastodon(text, media), postToTwitter(text, media)]);
  } else {
    await Promise.all([postToMastodon(text), postToTwitter(text)]);
  }
}

function splitToThread(text: string, maxLength: number = 280): string[] {
  let splitText = text.split('\n');

  let threadArray: string[] = [];

  let currentthread = '';

  for (let i = 0; i < splitText.length; i++) {
    if (currentthread.length + splitText[i].length + 1 <= maxLength) {
      currentthread += splitText[i] + '\n';
    } else {
      threadArray.push(currentthread);
      currentthread = splitText[i] + '\n';
    }
  }

  threadArray.push(currentthread);

  return threadArray;
}

const clients = {
  mastodon: postToMastodon,
  twitter: postToTwitter
};

export { postToMastodon, postToTwitter, postToAll, clients };
