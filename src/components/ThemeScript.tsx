/**
 * Inline blocking script — applies stored theme before paint (no FOUC).
 * Keep in sync with ThemeToggle STORAGE_KEY.
 */
export function ThemeScript() {
  const code = `(function(){try{var k='neet-cbt-theme';var t=localStorage.getItem(k);if(t!=='dark'&&t!=='light')t='light';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#0b1220':'#1e4d7b');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
