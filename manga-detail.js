/* 漫画详情层 —— 信息收集页和漫画页共用
   MangaDetail.open({
     name, slug, base, chapters:[{title,count}],
     meta:{平台,进度}, progress,
     fields:[{k:'标签', v:['a','b']}, {k:'作者', v:['xxx']}, ...],
     onPreview(page), onRead()
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
          '<div class="mdinfo">' +
            '<h2></h2>' +
            '<div class="mdtags"></div>' +
            '<div class="mdstat"></div>' +
            '<div class="mdrows"></div>' +
          '</div>' +
        '</div>' +
        '<div class="mdh">全部预览</div>' +
        '<div class="mdgrid"></div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('[data-md="back"]').onclick = () => api.close();
    root.querySelector('[data-md="read"]').onclick = () => cur && cur.onRead && cur.onRead();
    return root;
  }

  const FALLBACK = "https://pub-84db0f3292924614bfb2c03bf14a4e4f.r2.dev";

  function pagePath(o, i){
    return "/m/" + o.slug + "/00/" + String(i).padStart(4, "0") + ".webp";
  }

  function pageUrl(o, i){
    return o.base.replace(/\/+$/, "") + pagePath(o, i);
  }

  // 主域名失败就换备用域名再试一次
  function loadImg(img, o, i){
    const hosts = [o.base.replace(/\/+$/, "")];
    if (hosts[0] !== FALLBACK) hosts.push(FALLBACK);
    let n = 0;
    img.onerror = () => {
      n++;
      if (n < hosts.length) img.src = hosts[n] + pagePath(o, i);
      else { img.onerror = null; img.removeAttribute("src"); }
    };
    img.src = hosts[0] + pagePath(o, i);
  }

  function chip(text, cls){
    const sp = document.createElement("span");
    sp.className = "mdchip" + (cls ? " " + cls : "");
    sp.textContent = text;
    return sp;
  }

  function open(opts){
    const o = Object.assign({ base: "https://img.ygylyp.app", onRead: null, onPreview: null, fields: [] }, opts);
    cur = o;
    const r = ensure();
    const total = (o.chapters || []).reduce((a, c) => a + (c.count || 0), 0);

    r.querySelector(".mdbar .t").textContent = o.name;
    r.querySelector("h2").textContent = o.name;

    const cover = r.querySelector(".mdcover img");
    loadImg(cover, o, 1);

    // 顶部小标签（类型 / 平台 / 进度）
    const tw = r.querySelector(".mdtags");
    tw.innerHTML = "";
    tw.appendChild(chip("漫画", "acc"));
    if (o.meta && o.meta["平台"]) tw.appendChild(chip(o.meta["平台"]));
    if (o.meta && o.meta["进度"]) tw.appendChild(chip(o.meta["进度"]));
    if ((o.chapters || []).length > 1) tw.appendChild(chip(o.chapters.length + " 话"));

    const p = o.progress || 0;
    r.querySelector(".mdstat").textContent = total + " 页" + (p > 1 ? " · 上次读到第 " + p + " 页" : " · 还没开始读");

    // 信息表（仿 nhentai 那种 key: chips）
    const rows = r.querySelector(".mdrows");
    rows.innerHTML = "";

    // 标签行（可编辑，前提是传了 editableTags）
    if (o.editableTags) {
      const row = document.createElement("div");
      row.className = "mdrow";
      const k = document.createElement("div");
      k.className = "mdk";
      k.textContent = "标签";
      const v = document.createElement("div");
      v.className = "mdv";
      const drawTags = () => {
        v.innerHTML = "";
        (o.tags || []).forEach(t => {
          const c = chip(t);
          c.title = "点 × 删掉";
          const x = document.createElement("span");
          x.textContent = " ×";
          x.style.opacity = ".55";
          x.style.cursor = "pointer";
          x.onclick = (e) => { e.stopPropagation(); o.tags = o.tags.filter(y => y !== t); drawTags(); save(); };
          c.appendChild(x);
          v.appendChild(c);
        });
        const add = document.createElement("span");
        add.className = "mdchip";
        add.style.cursor = "pointer";
        add.style.color = "var(--acc)";
        add.style.borderColor = "var(--acc-soft)";
        add.textContent = "+ 加标签";
        add.onclick = () => pickTag();
        v.appendChild(add);
      };
      const save = () => { if (o.onSaveTags) o.onSaveTags(o.tags.slice()).catch(() => {}); };
      const pickTag = () => {
        const pool = (o.allTags || []).filter(t => (o.tags || []).indexOf(t) < 0);
        const text = prompt("输入标签（可填新的）" + (pool.length ? "\n现有：" + pool.join("、") : ""), "");
        if (!text) return;
        const t = text.trim();
        if (!t) return;
        if ((o.tags || []).indexOf(t) >= 0) return;
        o.tags = (o.tags || []).concat([t]);
        drawTags();
        save();
      };
      drawTags();
      row.appendChild(k);
      row.appendChild(v);
      rows.appendChild(row);
    }
    // 自动补几行，免得右边太空白
    const auto = [];
    if (o.meta && o.meta["平台"]) auto.push({ k: "平台", v: [o.meta["平台"]] });
    if (o.meta && o.meta["进度"]) auto.push({ k: "进度", v: [o.meta["进度"]] });
    auto.push({ k: "页数", v: [String(total)] });
    if ((o.chapters || []).length > 1) auto.push({ k: "话数", v: [String(o.chapters.length)] });
    const has = new Set((o.fields || []).map(f => f && f.k));
    const merged = auto.filter(f => !has.has(f.k)).concat(o.fields || []);
    const list = merged.filter(f => f && f.v && f.v.length);
    list.forEach(f => {
      const row = document.createElement("div");
      row.className = "mdrow";
      const k = document.createElement("div");
      k.className = "mdk";
      k.textContent = f.k;
      const v = document.createElement("div");
      v.className = "mdv";
      f.v.forEach(x => v.appendChild(chip(x)));
      row.appendChild(k);
      row.appendChild(v);
      rows.appendChild(row);
    });

    // 全部预览
    const grid = r.querySelector(".mdgrid");
    grid.innerHTML = "";
    for (let i = 1; i <= total; i++){
      const cell = document.createElement("div");
      cell.className = "mdcell";
      const im = document.createElement("img");
      im.loading = "lazy"; im.referrerPolicy = "no-referrer"; im.alt = "";
      loadImg(im, o, i);
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
