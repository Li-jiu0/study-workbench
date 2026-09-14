/* ============================================================
 * i浜轰紮浼村洟 + 鑱婂ぉ瀹? * 涓嶅悓鎬ф牸鐨勮櫄鎷熶紮浼达紝鏂囧瓧浜掑姩锛宨浜轰笓灞炵ぞ浜ょ粌涔犲満
 * ============================================================ */
(function () {
  'use strict';

  // ========== 浼欎即鏁版嵁 ==========
  const PARTNERS = [
    {
      id: 'rabbit',
      name: '灏忓厰',
      avatar: '馃惏',
      color: '#FFB6C1',
      personality: '娓╂煍娌绘剤鍨?,
      traits: ['鍠勮В浜烘剰', '鑰愬績鍊惧惉', '娓╁拰鍥炲簲'],
      desc: '鏈€閫傚悎i浜虹殑鑱婂ぉ浼欎即锛屾案杩滀笉浼氳瘎鍒や綘锛屾參鎱㈤櫔浣犵粌琛ㄨ揪',
      greet: '鍡綖鎴戞槸灏忓厰锛屼粖澶╂兂鑱婄偣浠€涔堝憖锛熶笉鐢ㄧ揣寮狅紝鎱㈡參璇村氨濂金煒?,
      replyStyle: '鍏堝叡鎯咃紝鍐嶆俯鍜屽湴缁欏嚭寤鸿锛岃姘旀煍杞紝澶氱敤璇皵璇?
    },
    {
      id: 'fox',
      name: '灏忕嫄',
      avatar: '馃',
      color: '#FF8C42',
      personality: '鏈烘櫤绀剧墰鍨?,
      traits: ['鍙嶅簲蹇?, '骞介粯椋庤叮', '璇濋杈句汉'],
      desc: '鏁欎綘濡備綍鎺ヨ瘽銆佹姏姊椼€佹椿璺冩皵姘涳紝璺熺潃e浜烘湅鍙嬪绀句氦',
      greet: '鍢匡紒鎴戞槸灏忕嫄锛屼粖澶╁挶浠粌鐐瑰暐锛熸帴璇濓紵鐮村啺锛熻繕鏄艾鑱婃嫰鏁戯紵馃敟',
      replyStyle: '骞介粯椋庤叮锛屽弽搴斿揩锛屼細涓诲姩鎶涜瘽棰橈紝鏁欎綘绀句氦鎶€宸?
    },
    {
      id: 'owl',
      name: '灏忛府',
      avatar: '馃',
      color: '#7B68EE',
      personality: '鐞嗘€у垎鏋愬瀷',
      traits: ['閫昏緫娓呮櫚', '娣卞害鎬濊€?, '瀹㈣鍒嗘瀽'],
      desc: '甯綘鍒嗘瀽娌熼€氬満鏅紝鎷嗚В璇濇湳閫昏緫锛岃浣犺寰楁湁閬撶悊',
      greet: '浣犲ソ锛屾垜鏄皬楦€傞渶瑕佸垎鏋愬摢涓矡閫氬満鏅紵鎴栬€呮兂缁冪粌閫昏緫琛ㄨ揪锛燄煋?,
      replyStyle: '鐞嗘€у瑙傦紝閫昏緫娓呮櫚锛屼細鍒嗘瀽闂鏈川锛岀粰鍑虹粨鏋勫寲寤鸿'
    },
    {
      id: 'cat',
      name: '灏忕尗',
      avatar: '馃惐',
      color: '#DDA0DD',
      personality: '鍌插▏鎱㈢儹鍨?,
      traits: ['澶栧喎鍐呯儹', '鐪熷疄涓嶈', '鏈夎竟鐣屾劅'],
      desc: '妯℃嫙鐪熷疄绀句氦涓殑"闅炬悶"瀵硅薄锛岀粌涔犲浣曚笌涓嶅悓鎬ф牸鐨勪汉鐩稿',
      greet: '鈥︹€︽槸浣犲晩銆傛湁浠€涔堜簨蹇锛屾垜杩樿鎵撶浌鍛€傪煒掞紙鍒媴蹇冿紝鎴戝彧鏄槾纭級',
      replyStyle: '鍌插▏锛屾湁鐐瑰喎娣★紝浣嗕細璁ょ湡鍥炲簲锛岄渶瑕佷綘涓诲姩鐮村啺'
    },
    {
      id: 'bear',
      name: '灏忕唺',
      avatar: '馃惢',
      color: '#DEB887',
      personality: '韪忓疄鍙潬鍨?,
      traits: ['绋抽噸鍙潬', '鐪熻瘹瀹炲湪', '缁欏畨鍏ㄦ劅'],
      desc: '鍍忚€佹湅鍙嬩竴鏍疯笍瀹烇紝缁冧範娣卞害浜ゆ祦鍜岀湡璇氳〃杈?,
      greet: '鏉ュ暒锛熷潗锛屽枬鍙ｆ按銆備粖澶╂兂鑱婄偣鍟ワ紵宸ヤ綔锛熷涔狅紵杩樻槸闅忎究鍞犲敔锛熲槙',
      replyStyle: '绋抽噸鐪熻瘹锛屽儚鑰佹湅鍙嬩竴鏍凤紝浼氳鐪熷€惧惉锛岀粰鍑哄疄鍦ㄧ殑寤鸿'
    }
  ];

  // ========== 璇濋搴?==========
  const CHAT_TOPICS = [
    '浠婂ぉ閬囧埌浜嗕粈涔堟湁瓒ｇ殑浜嬶紵',
    '濡傛灉鍙互鎷ユ湁涓€绉嶈秴鑳藉姏锛屼綘鎯宠浠€涔堬紵',
    '浣犳渶杩戝湪杩戒粈涔堝墽/鐪嬩粈涔堜功锛?,
    '鍛ㄦ湯涓€鑸€庝箞瀹夋帓锛?,
    '宸ヤ綔/瀛︿範涓渶鏈夋垚灏辨劅鐨勪竴浠朵簨锛?,
    '濡傛灉鏄庡ぉ涓嶇敤涓婄彮/涓婂锛屼綘浼氬仛浠€涔堬紵',
    '鏈€杩戝鍒颁簡浠€涔堟柊涓滆タ锛?,
    '浣犺寰梚浜烘渶澶х殑浼樺娍鏄粈涔堬紵',
    '鏈夋病鏈変粈涔堜竴鐩存兂鍋氫絾杩樻病鍋氱殑浜嬶紵',
    '鎻忚堪涓€涓嬩綘鐞嗘兂涓殑涓€澶?
  ];

  // ========== 鐘舵€?==========
  let currentPartner = null;
  let chatHistory = [];
  let chatCount = 0;

  // ========== 宸ュ叿鍑芥暟 ==========
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function toast(msg) {
    if (window.toast) { window.toast(msg); return; }
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ========== 鐢熸垚浼欎即鍥炲锛堝熀浜庢€ф牸鐨勬ā鏉垮洖澶嶏級 ==========
  function generateReply(partner, userMsg) {
    const msg = userMsg.toLowerCase();
    
    // 鍏抽敭璇嶅尮閰?    if (msg.includes('浣犲ソ') || msg.includes('鍡?) || msg.includes('hi') || msg.includes('hello')) {
      return getGreetingReply(partner);
    }
    if (msg.includes('璋㈣阿') || msg.includes('鎰熻阿')) {
      return getThanksReply(partner);
    }
    if (msg.includes('鍐嶈') || msg.includes('鎷滄嫓') || msg.includes('bye')) {
      return getByeReply(partner);
    }
    if (msg.includes('绱у紶') || msg.includes('瀹虫€?) || msg.includes('涓嶆暍')) {
      return getEncourageReply(partner);
    }
    if (msg.includes('?') || msg.includes('锛?)) {
      return getQuestionReply(partner, userMsg);
    }
    
    // 榛樿鍥炲锛堝熀浜庢€ф牸锛?    return getDefaultReply(partner, userMsg);
  }

  function getGreetingReply(p) {
    const replies = {
      rabbit: '浣犲ソ鍛€锝炵湅鍒颁綘鐪熷紑蹇冿紒浠婂ぉ蹇冩儏鎬庝箞鏍凤紵馃槉',
      fox: '鍝燂紒浣犳潵鍟︼紒浠婂ぉ鐘舵€佷笉閿欏槢锛屽噯澶囧ソ缁冪ぞ浜や簡鍚楋紵馃敟',
      owl: '浣犲ソ銆備粖澶╂兂缁冧範浠€涔堝唴瀹癸紵鎴戝彲浠ュ府浣犲垎鏋愩€?,
      cat: '鈥︹€﹀張鏄綘鍟娿€傜畻浜嗭紝鏃㈢劧鏉ヤ簡灏卞潗鍚с€傪煒?,
      bear: '鏉ュ暒锛佸揩鍧愬揩鍧愶紝浠婂ぉ鎯宠亰鐐瑰暐锛熲槙'
    };
    return replies[p.id] || '浣犲ソ锝?;
  }

  function getThanksReply(p) {
    const replies = {
      rabbit: '涓嶇敤璋㈠暒锝炶兘甯埌浣犳垜涔熷緢寮€蹇冿紒馃挄',
      fox: '瀹㈡皵鍟ワ紒鍜变滑璋佽窡璋佸晩锛佹湁闂闅忔椂鎵炬垜锛侌煒?,
      owl: '涓嶅姘斻€傚笇鏈涙垜鐨勫垎鏋愬浣犳湁甯姪銆?,
      cat: '鈥︹€﹀摷锛岀畻浣犳湁鑹績銆傪煒?,
      bear: '瀹筹紝杩欐湁鍟ョ殑锛佹湅鍙嬩箣闂翠笉灏卞簲璇ヤ簰鐩稿府蹇欏槢锛?
    };
    return replies[p.id] || '涓嶅姘旓綖';
  }

  function getByeReply(p) {
    const replies = {
      rabbit: '鍐嶈鍟︼綖璁板緱濂藉ソ浼戞伅锛屼笅娆″啀鑱婂摝锛侌煈?,
      fox: '璧板暒锛熼偅涓嬫缁х画缁冿紒璁颁綇浠婂ぉ瀛︾殑鎶€宸у摝锛侌煉?,
      owl: '鍐嶈銆傚缓璁綘浠婂ぉ澶嶇洏涓€涓嬫垜浠亰鐨勫唴瀹广€?,
      cat: '鈥︹€︾粓浜庤蛋浜嗐€傦紙鍏跺疄鏈夌偣鑸嶄笉寰楋級涓嬫鍒お涔呮墠鏉ュ晩銆傪煒?,
      bear: '琛岋紝閭ｄ綘鍏堝繖锛佹湁绌哄啀鏉ュ敔锛岄殢鏃舵杩庯紒'
    };
    return replies[p.id] || '鍐嶈锝?;
  }

  function getEncourageReply(p) {
    const replies = {
      rabbit: '鍒揣寮犲憖锝炰綘宸茬粡寰堟浜嗭紒鎱㈡參鏉ワ紝涓€姝ヤ竴姝ュ氨濂斤紝鎴戦櫔鐫€浣犲憿馃',
      fox: '绱у紶鍟ワ紒浣犳瘮浣犳兂璞′腑鍘夊澶氫簡锛佹潵锛屾繁鍛煎惛锛屽挶浠竴姝ヤ竴姝ユ潵锛侌煉?,
      owl: '绱у紶鏄甯哥殑銆傚缓璁綘鎶婂ぇ鐩爣鎷嗚В鎴愬皬姝ラ锛屾瘡瀹屾垚涓€姝ュ氨缁欒嚜宸辨鍚戝弽棣堛€傜劍铏戝線寰€鏉ヨ嚜浜庡鏈煡鐨勬亹鎯э紝鍑嗗瓒婂厖鍒嗭紝绱у紶瓒婂皯銆?,
      cat: '鈥︹€︽€曚粈涔堬紝鍙堜笉浼氬悆浜嗕綘銆傦紙灏忓０锛夊叾瀹炰綘宸茬粡鍋氬緱寰堝ソ浜嗭紝姣旀垜绗竴娆″己澶氫簡銆傪煒?,
      bear: '鍡紝绱у紶鍟ュ晩锛佽皝閮芥湁绗竴娆★紝鎱㈡參鏉ャ€備綘瑕佹槸瀹炲湪绱у紶锛屽氨鎶婂鏂瑰綋鎴愬ぇ鐧借彍锛屽弽姝ｈ閿欎簡涔熶笉浼氬皯鍧楄倝锛?
    };
    return replies[p.id] || '鍒揣寮狅紝浣犲彲浠ョ殑锛?;
  }

  function getQuestionReply(p, question) {
    const replies = {
      rabbit: `杩欎釜闂闂緱鐪熷ソ锝炶鎴戞兂鎯冲晩鈥︹€︽垜瑙夊緱鍛紝鏈€閲嶈鐨勬槸璺熺潃鑷繁鐨勬劅瑙夎蛋锛屼綘瑙夊緱鍛紵馃槉`,
      fox: `鍝燂紒杩欎釜闂鏈夋剰鎬濓紒瑕佹垜璇村晩鈥斺€旇繖灏卞緱鐪嬪叿浣撴儏鍐典簡锛佷笉杩囨垜鍙互鏁欎綘涓€涓竾鑳藉洖绛斿叕寮忥細鍏堣偗瀹?鍐嶅垎鏋?缁欓€夐」锛屽拫鏍凤紵瀛﹀埌娌★紵馃槑`,
      owl: `鍏充簬"${question}"杩欎釜闂锛屾垜浠彲浠ヤ粠涓変釜缁村害鏉ュ垎鏋愶細绗竴锛屾牳蹇冭瘔姹傛槸浠€涔堬紱绗簩锛屾湁鍝簺鍙€夋柟妗堬紱绗笁锛屾瘡涓柟妗堢殑鍒╁紛銆備綘鎯冲厛浠庡摢涓搴︽繁鍏ワ紵`,
      cat: `鈥︹€﹁繖闂闂垜骞插槢銆傦紙鎬濊€冧簡涓€涓嬶級涓嶈繃鏃㈢劧浣犻棶浜嗏€︹€︽垜瑙夊緱鍚э紝璺熺潃鐩磋璧板氨琛岋紝鎯抽偅涔堝绱笉绱€傪煒抈,
      bear: `杩欎釜闂鍟娾€︹€﹁鎴戞兂鎯炽€傝鎴戣鍟婏紝鍒兂澶鏉傦紝鎬庝箞鑸掓湇鎬庝箞鏉ワ紒瀹炲湪鎷夸笉瀹氫富鎰忥紝灏辨姏纭竵锛屾姏鐨勬椂鍊欎綘蹇冮噷灏辨湁绛旀浜嗭紒`
    };
    return replies[p.id] || '杩欎釜闂寰堟湁鎰忔€濓綖';
  }

  function getDefaultReply(p, userMsg) {
    const replies = {
      rabbit: `鍡棷锛屾垜鍦ㄥ惉鍛綖浣犺鐨勮繖涓垜鑳界悊瑙ｏ紝缁х画璇村憖锛屾垜鎯冲鍚惉馃槉`,
      fox: `鍝︼紵杩欎釜鏈夌偣鎰忔€濓紒鏉ワ紝灞曞紑璇磋锛佹垜璺熶綘璁诧紝閬囧埌杩欑鎯呭喌鍟婏紝浣犲彲浠ヨ繖鏍封€︹€︼紙姝ゅ鐪佺暐100瀛楃ぞ浜ゆ妧宸э級瀛﹀埌娌★紵馃槑`,
      owl: `浣犺鐨勫唴瀹规垜璁板綍浜嗐€備粠娌熼€氬垎鏋愮殑瑙掑害鏉ョ湅锛屼綘琛ㄨ揪鐨勬牳蹇冧俊鎭槸娓呮櫚鐨勶紝浣嗗彲浠ュ湪缁撴瀯涓婂仛浼樺寲锛氬缓璁娇鐢?瑙傜偣-璁烘嵁-鎬荤粨"鐨勪笁娈靛紡锛屼細鏇存湁璇存湇鍔涖€俙,
      cat: `鈥︹€﹀摝銆傦紙鍏跺疄鍦ㄨ鐪熷惉锛夌劧鍚庡憿锛燄煒抈,
      bear: `鍡棷锛屾垜鎳備綘鐨勬剰鎬濓紒杩欑鎯呭喌鎴戜篃閬囧埌杩囷紝鍚庢潵鎴戝彂鐜板晩锛屽叾瀹炴病鍟ュぇ涓嶄簡鐨勶紝鎯冲紑鐐瑰氨濂戒簡锛佹潵锛屽枬鍙ｆ按锛屾參鎱㈣锛乣
    };
    return replies[p.id] || '鍡棷锛屾垜鍦ㄥ惉锝?;
  }

  // ========== 娓叉煋浼欎即閫夋嫨鐣岄潰 ==========
  function renderPartnerSelect() {
    const partnersHtml = PARTNERS.map(p => `
      <div class="ip-card" onclick="IPartner.select('${p.id}')" style="background:linear-gradient(135deg,${p.color}22,${p.color}11)">
        <div class="ip-avatar" style="background:${p.color}">${p.avatar}</div>
        <div class="ip-info">
          <div class="ip-name">${p.name} <span class="ip-tag">${p.personality}</span></div>
          <div class="ip-desc">${p.desc}</div>
          <div class="ip-traits">${p.traits.map(t => `<span class="ip-trait">${t}</span>`).join('')}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="ip-header">
        <div class="ip-title">馃 i浜轰紮浼村洟</div>
        <div class="ip-subtitle">閫夋嫨涓€涓紮浼村紑濮嬭亰澶╋紝涓嶅悓鎬ф牸涓嶅悓鍥炲簲椋庢牸锛岀粌绀句氦涓嶅按灏?/div>
      </div>
      <div class="ip-partner-list">${partnersHtml}</div>
      <div class="ip-tips">
        馃挕 灏忔彁绀猴細杩欐槸瀹夊叏鐨勭粌涔犲満锛岃閿欎簡涔熸病鍏崇郴锛屼紮浼翠笉浼氳瘎鍒や綘
      </div>
    `;
  }

  // ========== 娓叉煋鑱婂ぉ瀹?==========
  function renderChatRoom() {
    const p = currentPartner;
    const msgsHtml = chatHistory.map(m => `
      <div class="ip-msg ${m.role === 'user' ? 'ip-msg-user' : 'ip-msg-partner'}">
        ${m.role === 'partner' ? `<div class="ip-msg-avatar" style="background:${p.color}">${p.avatar}</div>` : ''}
        <div class="ip-msg-bubble">${esc(m.text)}</div>
      </div>
    `).join('');

    const quickTopics = CHAT_TOPICS.slice(0, 3).map(t => 
      `<span class="ip-topic" onclick="IPartner.sendTopic('${esc(t)}')">${t}</span>`
    ).join('');

    return `
      <div class="ip-chat-header" style="background:linear-gradient(135deg,${p.color}33,${p.color}11)">
        <button class="ip-back" onclick="IPartner.back()">鈫?鎹釜浼欎即</button>
        <div class="ip-chat-partner">
          <div class="ip-chat-avatar" style="background:${p.color}">${p.avatar}</div>
          <div>
            <div class="ip-chat-name">${p.name}</div>
            <div class="ip-chat-status">${p.personality} 路 鍦ㄧ嚎</div>
          </div>
        </div>
        <div class="ip-chat-count">宸茶亰 ${chatCount} 鍙?/div>
      </div>
      <div class="ip-chat-messages" id="ipChatMessages">${msgsHtml}</div>
      <div class="ip-quick-topics">
        <span class="ip-quick-label">馃挕 涓嶇煡閬撹鍟ワ紵璇曡瘯锛?/span>
        ${quickTopics}
      </div>
      <div class="ip-chat-input">
        <input type="text" id="ipChatInput" placeholder="杈撳叆浣犳兂璇寸殑璇?.." 
               onkeydown="if(event.key==='Enter')IPartner.send()" />
        <button class="ip-send-btn" onclick="IPartner.send()">鍙戦€?/button>
      </div>
    `;
  }

  // ========== 鎵撳紑i浜轰紮浼村洟 ==========
  function open() {
    // 妫€鏌ユ槸鍚﹀凡鏈夐伄缃?    let mask = document.getElementById('ipMask');
    if (mask) { mask.remove(); }

    mask = document.createElement('div');
    mask.id = 'ipMask';
    mask.className = 'ip-mask';
    mask.innerHTML = `
      <div class="ip-panel" id="ipPanel">
        <button class="ip-close" onclick="IPartner.close()">鉁?/button>
        <div id="ipContent">${renderPartnerSelect()}</div>
      </div>
    `;
    document.body.appendChild(mask);

    // 娉ㄥ叆鏍峰紡锛堝彧娉ㄥ叆涓€娆★級
    if (!document.getElementById('ipStyle')) {
      const style = document.createElement('style');
      style.id = 'ipStyle';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  // ========== 閫夋嫨浼欎即 ==========
  function select(partnerId) {
    currentPartner = PARTNERS.find(p => p.id === partnerId);
    chatHistory = [];
    chatCount = 0;
    
    // 娣诲姞浼欎即鐨勯棶鍊?    chatHistory.push({ role: 'partner', text: currentPartner.greet });
    chatCount++;

    document.getElementById('ipContent').innerHTML = renderChatRoom();
    setTimeout(() => {
      const msgs = document.getElementById('ipChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 100);
  }

  // ========== 鍙戦€佹秷鎭?==========
  function send() {
    const input = document.getElementById('ipChatInput');
    const text = input.value.trim();
    if (!text) { toast('璇寸偣浠€涔堝惂锝?); return; }
    if (!currentPartner) return;

    // 娣诲姞鐢ㄦ埛娑堟伅
    chatHistory.push({ role: 'user', text });
    chatCount++;
    input.value = '';
    
    updateChatUI();

    // 妯℃嫙浼欎即"姝ｅ湪杈撳叆"
    setTimeout(() => {
      const reply = generateReply(currentPartner, text);
      chatHistory.push({ role: 'partner', text: reply });
      chatCount++;
      updateChatUI();
      
      // 璁板綍瀛︿範鏁版嵁
      if (window.recordStudy) {
        window.recordStudy('comm', 'i浜鸿亰澶?, 1);
      }
    }, 800 + Math.random() * 700);
  }

  // ========== 鍙戦€佸揩鎹疯瘽棰?==========
  function sendTopic(topic) {
    const input = document.getElementById('ipChatInput');
    input.value = topic;
    send();
  }

  // ========== 鏇存柊鑱婂ぉUI ==========
  function updateChatUI() {
    const content = document.getElementById('ipContent');
    if (!content) return;
    content.innerHTML = renderChatRoom();
    setTimeout(() => {
      const msgs = document.getElementById('ipChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  // ========== 杩斿洖浼欎即閫夋嫨 ==========
  function back() {
    currentPartner = null;
    chatHistory = [];
    document.getElementById('ipContent').innerHTML = renderPartnerSelect();
  }

  // ========== 鍏抽棴 ==========
  function close() {
    const mask = document.getElementById('ipMask');
    if (mask) mask.remove();
  }

  // ========== 鏍峰紡 ==========
  function getStyles() {
    return `
      .ip-mask {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        z-index: 99998; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      }
      .ip-panel {
        width: 90%; max-width: 560px; height: 85vh; max-height: 700px;
        background: var(--bg, #fff); border-radius: 20px; overflow: hidden;
        position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
      }
      .ip-close {
        position: absolute; top: 12px; right: 12px; z-index: 10;
        width: 32px; height: 32px; border-radius: 50%; border: none;
        background: rgba(0,0,0,0.1); cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
      }
      .ip-close:hover { background: rgba(0,0,0,0.2); }
      #ipContent { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
      
      /* 浼欎即閫夋嫨 */
      .ip-header { padding: 24px 20px 16px; text-align: center; }
      .ip-title { font-size: 22px; font-weight: 800; color: var(--text, #333); margin-bottom: 6px; }
      .ip-subtitle { font-size: 13px; color: var(--text-secondary, #888); line-height: 1.5; }
      .ip-partner-list { padding: 0 16px; flex: 1; overflow-y: auto; }
      .ip-card {
        display: flex; gap: 14px; padding: 16px; border-radius: 16px;
        margin-bottom: 12px; cursor: pointer; transition: all 0.2s;
        border: 2px solid transparent;
      }
      .ip-card:hover { transform: translateY(-2px); border-color: var(--primary, #5B8DEF); }
      .ip-avatar {
        width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 30px;
      }
      .ip-info { flex: 1; min-width: 0; }
      .ip-name { font-size: 16px; font-weight: 700; color: var(--text, #333); margin-bottom: 4px; }
      .ip-tag {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background: var(--primary, #5B8DEF); color: #fff; margin-left: 6px; font-weight: 500;
      }
      .ip-desc { font-size: 12px; color: var(--text-secondary, #888); margin-bottom: 8px; line-height: 1.4; }
      .ip-traits { display: flex; gap: 6px; flex-wrap: wrap; }
      .ip-trait {
        font-size: 11px; padding: 2px 8px; border-radius: 8px;
        background: rgba(0,0,0,0.06); color: var(--text-secondary, #888);
      }
      .ip-tips {
        padding: 16px 20px; text-align: center; font-size: 12px;
        color: var(--text-muted, #aaa); border-top: 1px solid var(--border, #eee);
      }
      
      /* 鑱婂ぉ瀹?*/
      .ip-chat-header {
        padding: 16px; display: flex; align-items: center; gap: 12px;
        border-bottom: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-back {
        border: none; background: rgba(0,0,0,0.06); padding: 6px 10px;
        border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text, #333);
      }
      .ip-back:hover { background: rgba(0,0,0,0.1); }
      .ip-chat-partner { display: flex; align-items: center; gap: 10px; flex: 1; }
      .ip-chat-avatar {
        width: 40px; height: 40px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center; font-size: 22px;
      }
      .ip-chat-name { font-size: 15px; font-weight: 700; color: var(--text, #333); }
      .ip-chat-status { font-size: 11px; color: #4CAF50; }
      .ip-chat-count { font-size: 12px; color: var(--text-muted, #aaa); }
      
      .ip-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      }
      .ip-msg { display: flex; gap: 8px; max-width: 85%; }
      .ip-msg-user { align-self: flex-end; flex-direction: row-reverse; }
      .ip-msg-partner { align-self: flex-start; }
      .ip-msg-avatar {
        width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      .ip-msg-bubble {
        padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5;
        background: var(--bg, #f5f5f5); color: var(--text, #333);
      }
      .ip-msg-user .ip-msg-bubble {
        background: var(--primary, #5B8DEF); color: #fff; border-bottom-right-radius: 4px;
      }
      .ip-msg-partner .ip-msg-bubble { border-bottom-left-radius: 4px; }
      
      .ip-quick-topics {
        padding: 8px 16px; display: flex; gap: 8px; flex-wrap: wrap;
        border-top: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-quick-label { font-size: 11px; color: var(--text-muted, #aaa); align-self: center; }
      .ip-topic {
        font-size: 11px; padding: 4px 10px; border-radius: 12px; cursor: pointer;
        background: rgba(91,141,239,0.1); color: var(--primary, #5B8DEF);
        transition: all 0.2s;
      }
      .ip-topic:hover { background: rgba(91,141,239,0.2); }
      
      .ip-chat-input {
        display: flex; gap: 8px; padding: 12px 16px;
        border-top: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-chat-input input {
        flex: 1; padding: 10px 14px; border-radius: 12px;
        border: 1px solid var(--border, #ddd); background: var(--bg, #fff);
        color: var(--text, #333); font-size: 14px; outline: none;
      }
      .ip-chat-input input:focus { border-color: var(--primary, #5B8DEF); }
      .ip-send-btn {
        padding: 10px 20px; border-radius: 12px; border: none;
        background: var(--primary, #5B8DEF); color: #fff; font-size: 14px;
        font-weight: 600; cursor: pointer; transition: all 0.2s;
      }
      .ip-send-btn:hover { opacity: 0.9; }
    `;
  }

  // ========== 鏆撮湶API ==========
  window.IPartner = {
    open, select, send, sendTopic, back, close
  };

  console.log('鉁?i浜轰紮浼村洟宸插姞杞?);
})();
