
import { ScraperData, ScraperError, Chapter, Directory, DirectoryItem, ScraperResponse } from "../types";
import fetch from "node-fetch";
import Fuse from 'fuse.js'
import updateManga from "../util/updateManga";

interface ChapterResponse {
	/** For example, 102280 */
	Chapter: string;
	/** 
	 * Chapter type. 
	 * Some mangas name their chapters, differently, like "quest" or "story". 
	 * Can also be just "chapter" 
	 */
	Type: string;
	/** Date string. Formatted like "yyyy-mm-dd hh:mm:ss" */
	Date: string;
	/** I don't even know */
	ChapterName: string | null;
}



interface SearchOptions {
	resultCount?: number;
}

class MangaseeClass {

	public async search(query: string, { resultCount = 40 }: SearchOptions = {}): Promise<(ScraperResponse)[]> {

		// Fetch search results
		const searchUrl = `https://mangasee123.com/search/?sort=vm&desc=true&name=${encodeURIComponent(query)}`;
		let searchRes = await fetch(searchUrl);
		let html = await searchRes.text();

		let directory = JSON.parse(html.split("vm.Directory = ")[1].split("];")[0] + "]");
		
		let matchedResults = [];
		if(query === "") {
			// @ts-ignore You can totally substract strings.
			matchedResults = directory.sort((a: DirectoryItem, b: DirectoryItem) => b.v - a.v).slice(0, 40);
		} else {
			const fuse = new Fuse(directory, {
				keys: [Directory.Title]
			});
			matchedResults = fuse.search(query)
			  .map(result => result.item)
			  .slice(0, resultCount);
		}

		

		let searchResultData: ScraperResponse[] = await Promise.all(matchedResults.map((item: DirectoryItem) => updateManga(item[Directory.Slug])))

		return searchResultData.filter(v => v.success);
	}

	public async scrape(slug: string, chapter: number = -1, season: number = -1): Promise<ScraperResponse> {

		function error(status = -1, err = "Unknown"): ScraperError {
			return {
				status,
				err,
				success: false
			}
		}

		let html = "";

		try {
			let url = `https://mangasee123.com/manga/${slug}`;
			
			let pageRes = await fetch(url);
			
			html = await pageRes.text();

			if(!pageRes.ok || pageRes.url.endsWith("undefined") || html.includes(`<title>404 Page Not Found</title>`)) {
				console.error(`Throwing error for ${slug}`);
				return error(pageRes.status, html);
			}
		
			let title = html.split("<h1>")[1].split("</h1>")[0];
			let posterUrl = html.split(`<meta property="og:image" content="`)[1].split(`"`)[0];
			let alternateTitles = [];
			if(html.includes("Alternate Name(s):")) alternateTitles = html.split(`<span class="mlabel">Alternate Name(s):</span>`)[1].split("<")[0].trim().split(", ").filter(Boolean);
		
			let descriptionParagraphs = html.split(`<span class="mlabel">Description:</span>`)[1].split(">")[1].split("</")[0].trim().split("\n").filter(Boolean);
		
			let chapterData = JSON.parse(html.split(`vm.Chapters = `)[1].split(";")[0]);
			let chapters: Chapter[] = chapterData.map((ch: ChapterResponse) => {
				
				let season = Number(ch.Chapter[0]);
				let chapter = normalizeNumber(ch.Chapter.slice(1, -1))
				let label = `${ch.Type} ${chapter}`;
				let date = new Date(ch.Date);
				let href = `/${slug}/${season}-${chapter}/`;
		
				return {
					season,
					chapter,
					label,
					date,
					href
				}
		
			});

			let genres = JSON.parse(html.split(`"genre": `)[1].split("],")[0] + "]");
		
			return {
				constant: {
					title,
					slug,
					posterUrl,
					alternateTitles,
					descriptionParagraphs,
					genres
				},
				data: {
					chapters
				},
				success: true
			}
		} catch(err) {
			console.log(err.stack);
			return error(-1, err);
		}

		
	}
}

const Mangasee = new MangaseeClass();
export default Mangasee;

function normalizeNumber(input: string): number {
	let str = input;
	while(str.startsWith("0")) str = str.slice(1);
	return Number(str);
}

// I stole this. Will refactor later
function similarity(s1, s2) {
	var longer = s1;
	var shorter = s2;
	if (s1.length < s2.length) {
	  longer = s2;
	  shorter = s1;
	}
	var longerLength = longer.length;
	if (longerLength == 0) {
	  return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  }

  function editDistance(s1, s2) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();
  
	var costs = new Array();
	for (var i = 0; i <= s1.length; i++) {
	  var lastValue = i;
	  for (var j = 0; j <= s2.length; j++) {
		if (i == 0)
		  costs[j] = j;
		else {
		  if (j > 0) {
			var newValue = costs[j - 1];
			if (s1.charAt(i - 1) != s2.charAt(j - 1))
			  newValue = Math.min(Math.min(newValue, lastValue),
				costs[j]) + 1;
			costs[j - 1] = lastValue;
			lastValue = newValue;
		  }
		}
	  }
	  if (i > 0)
		costs[s2.length] = lastValue;
	}
	return costs[s2.length];
  }