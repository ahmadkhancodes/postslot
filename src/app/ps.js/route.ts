export const dynamic = "force-static";

// Optional, dependency free helper: finds forms posting to /f/<key> on this host and adds a signed time token.
const SCRIPT = `(function(){
  var host = (document.currentScript && new URL(document.currentScript.src).origin) || "";
  document.querySelectorAll('form[action*="/f/"]').forEach(function(f){
    var m = /\\/f\\/([0-9A-Za-z]{22})/.exec(f.getAttribute("action") || "");
    if (!m || f.querySelector('input[name="ps_token"]')) return;
    fetch(host + "/f/" + m[1] + "/token").then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.token) return;
      var i = document.createElement("input");
      i.type = "hidden"; i.name = "ps_token"; i.value = d.token; f.appendChild(i);
    }).catch(function(){});
  });
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
