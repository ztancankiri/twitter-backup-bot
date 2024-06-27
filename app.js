const twitterGetUrl = require("twitter-url-direct");
const telegram = require("./telegram");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const getScreenshot = async (url) => {
	const browser = await puppeteer.launch({
		defaultViewport: {
			width: 700,
			height: 2000
		}
	});

	const page = await browser.newPage();
	await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36");
	await page.goto(url, { waitUntil: "networkidle2" });
	const box = await page.evaluate(() => {
		const articles = document.getElementsByTagName("article");
		const box = articles[0].getBoundingClientRect();
		return { width: box.width, height: box.height, top: box.top, left: box.left };
	});

	const screenshotEncoded = await page.screenshot({ encoding: "base64" });
	const screenshot = Buffer.from(screenshotEncoded, "base64");
	await browser.close();

	const buffer = await sharp(screenshot).extract({ width: box.width, height: box.height, left: box.left, top: box.top }).toBuffer();

	return buffer;
};

const getData = async (url) => {
	try {
		const response = await twitterGetUrl(url);
		const data = {
			user: response.tweet_user.username,
			text: response.tweet_user.text
		};

		if (response.type === "video/gif") {
			data.type = "video";
			data.video = response.download[response.download.length - 1].url;
		} else if (response.type === "image") {
			data.type = "image";
			data.image = response.download;
		}

		return data;
	} catch (error) {
		return {
			type: "screenshot",
			screenshot: await getScreenshot(url)
		};
	}
};

const listenReceivers = async () => {
	try {
		const messages = await telegram.getMessages();

		if (messages && messages?.length > 0) {
			for (let i = 0; i < messages.length; i++) {
				const chat_id = messages[i].chat_id;
				const message_id = messages[i].message_id;
				const text = messages[i].text;

				if (text && text.includes("https://twitter.com/") && text.includes("/status/")) {
					console.log("New Request from", chat_id, ":", text);
					const data = await getData(text);

					if (data.type === "video") {
						await telegram.sendVideo(chat_id, data.video, `@${data.user}: ${data.text}`);
					} else if (data.type === "image") {
						await telegram.sendPhoto(chat_id, data.image, `@${data.user}: ${data.text}`);
					} else if (data.type === "screenshot") {
						await telegram.sendPhoto(chat_id, data.screenshot, "");
					}
				} else {
					await telegram.sendMessage(chat_id, "The given URL is invalid!");
				}

				await telegram.deleteMessage(chat_id, message_id);
			}
		}
	} catch (error) {
		console.error(error);
	}
};

setInterval(listenReceivers, 3000);
