/** Returns only explicitly labelled year-named PDF documents from SCA archive. */
export function listAnnualReportYears(html) {
  if(typeof html!=="string"||html.length>5_000_000)throw Error("Invalid archive HTML");
  const anchors=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const years=new Set();
  for(const [,href,label] of anchors){
    const match=href.match(/(?:^|\/)(20\d\d)\.pdf(?:\?|$)/i);
    const visible=label.replace(/<[^>]*>/g," ").trim();
    if(match&&visible.includes(match[1]))years.add(Number(match[1]));
  }
  return [...years].sort((a,b)=>a-b);
}
