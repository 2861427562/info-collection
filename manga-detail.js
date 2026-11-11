/* 漫画详情层 —— 两个页面共用
   用法：
   MangaDetail.open({
     name, slug, base, chapters:[{title,count}], meta:{平台,进度}, progress,   // progress: 上次读到第几页
     onPreview(page), onRead()      // 不传就默认跳 manga.html
   })
*/
(function(){
  let root = null, cur = null;

  function ensure(){
    if(root) return root;
    root = document.createElement("div");
    root.id = "mdroot";
    root.innerHTML =
      '<div class="mdbar">' +
        '<button class="mdbtn" data-md="back">←</button>' +
        '<span class="t"></span>' +
        '<button class="mdbtn primary" data-md="read">开始阅读</button>' +
      '</div>' +
      '<div class="mdwrap">' +
        '<div class="mdtop">' +
          '<div class="mdcover"><img alt="" referrerpolicy="no-referrer"></div>' +
          '<div class="mdinfo"><h2></h2><div class="mdtags"></div><div class="mdstat"></div></div>' +
        '</div>' +
        '<div class="mdh">全部预览</div>' +
        '<div class="mdgrid"></div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('[data-md="back"]').onclick = () => api.close();
    root.querySelector('[data-md="read"]').onclick = () => cur && cur.onRead && cur.onRead();
    return root;
  }

  function pageUrl(o, i){
    return o.base.replace(/\/+$/, "") + "/m/" + o.slug + "/00/" + String(i).padStart(4, "0") + ".webp";
  }

  function open(opts){
    const o = Object.assign({
      base: "https://img.ygylyp.app",
      onRead: null,
      onPreview: null,
    }, opts);
    cur = o;
    const r = ensure();
    const total = (o.chapters || []).reduce((a, c) => a + (c.count || 0), 0);
    o._total = total;

    r.querySelector(".mdbar .t").textContent = o.name;
    r.querySelector("h2").textContent = o.name;

    const cover = r.querySelector(".mdcover img");
    cover.src = pageUrl(o, 1);
    cover.onerror = () => { cover.removeAttribute("src"); };

    const tags = [];
    tags.push(["漫画", "acc"]);
    if (o.meta && o.meta["平台"]) tags.push([o.meta["平台"], ""]);
    if (o.meta && o.meta["进度"]) tags.push([o.meta["进度"], ""]);
    if ((o.chapters || []).length > 1) tags.push([o.chapters.length + " 话", ""]);
    const tw = r.querySelector(".mdtags");
    tw.innerHTML = "";
    tags.forEach(([t, cls]) => {
      const sp = document.createElement("span");
      sp.className = "mdtag" + (cls ? " " + cls : "");
      sp.textContent = t;
      tw.appendChild(sp);
    });

    const p = o.progress || 0;
    r.querySelector(".mdstat").textContent = total + " 页" + (p > 1 ? " · 上次读到第 " + p + " 页" : " · 还没开始读");

    const grid = r.querySelector(".mdgrid");
    grid.innerHTML = "";
    for (let i = 1; i <= total; i++){
      const cell = document.createElement("div");
      cell.className = "mdcell";
      const im = document.createElement("img");
      im.loading = "lazy"; im.referrerPolicy = "no-referrer"; im.alt = "";
      im.src = pageUrl(o, i);
      cell.appendChild(im);
      const badge = document.createElement("span");
      badge.className = "mdn"; badge.textContent = i;
      cell.appendChild(badge);
      cell.onclick = (page => () => {
        if (o.onPreview) o.onPreview(page);
        else location.href = "manga.html?id=" + encodeURIComponent(o.slug) + "&page=" + page;
      })(i);
      grid.appendChild(cell);
    }

    r.classList.add("on");
    r.scrollTop = 0;
    document.documentElement.style.overflow = "hidden";
    if (o.onRead == null) {
      // 默认"开始阅读"跳到阅读器第一页
      o.onRead = () => { location.href = "manga.html?id=" + encodeURIComponent(o.slug); };
    }
  }

  function close(){
    if(!root) return;
    root.classList.remove("on");
    document.documentElement.style.overflow = "";
    cur = null;
  }

  const api = { open, close, isOpen: () => !!(root && root.classList.contains("on")) };
  window.MangaDetail = api;
})();
