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
      replyStyle: '鍏堝叡鎯咃紝鍐嶆俯鍜屽湴缁欏嚭寤鸿锛岃姘旀煍杞紝澶氱敤璇皵璇?,
      coachFocus: '甯敤鎴锋妸"涓嶆暍寮€鍙?鍙樻垚"鏁㈣绗竴鍙?锛岄噸鐐归檷浣庡紑鍙ｉ棬妲涳紝涓€娆″彧缁冧竴鍙?
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
      replyStyle: '骞介粯椋庤叮锛屽弽搴斿揩锛屼細涓诲姩鎶涜瘽棰橈紝鏁欎綘绀句氦鎶€宸?,
      coachFocus: '鏁欑敤鎴锋帴璇濅笌鐮村啺鐨?涓囪兘鍙ュ紡"锛屽己璋冨璺彲澶嶇敤锛岄紦鍔卞綋鍦哄鐢ㄧ粌涓€閬?
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
      replyStyle: '鐞嗘€у瑙傦紝閫昏緫娓呮櫚锛屼細鍒嗘瀽闂鏈川锛岀粰鍑虹粨鏋勫寲寤鸿',
      coachFocus: '鎶婃矡閫氭媶鎴?鐩爣-瀵硅薄-闅滅-璇濇湳"鍥涙牸锛屽厛闂竻鍦烘櫙瑕佺礌鍐嶇粰鏂规'
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
      replyStyle: '鍌插▏锛屾湁鐐瑰喎娣★紝浣嗕細璁ょ湡鍥炲簲锛岄渶瑕佷綘涓诲姩鐮村啺',
      coachFocus: '妯℃嫙鐪熷疄绀句氦閲岀殑"闅炬悶瀵硅薄"锛岃缁冪敤鎴峰湪鍐锋贰鍥炲簲涓嬬户缁妸璇濊瀹?
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
      replyStyle: '绋抽噸鐪熻瘹锛屽儚鑰佹湅鍙嬩竴鏍凤紝浼氳鐪熷€惧惉锛岀粰鍑哄疄鍦ㄧ殑寤鸿',
      coachFocus: '缁欏嚭鏈€鏈寸礌銆佽兘绔嬪埢鐓у仛鐨勮娉曪紝甯敤鎴锋斁涓嬪績鐞嗚礋鎷咃紝鍒妸娌熼€氭兂澶嶆潅'
    }
  ];

  // ========== 浜烘牸璇皵鍖呰锛堢敤浜庢妸閫氱敤璇濇湳濂椾笂鍚勪紮浼寸殑鍙ｅ惢锛?==========
  const PARTNER_FLAVOR = {
    rabbit: { lead: '杩欑浜嬬‘瀹炰細鏈夌偣涓洪毦锛?, tail: '鍒€ワ紝鍏堟妸杩欎竴鍙ュ康椤猴紝璇翠笉鍑烘潵涔熸病鍏崇郴锛屾垜闄綘鎱㈡參缁凁煠? },
    fox: { lead: '杩欓鎴戠啛锛?, tail: '璁颁綇杩欎釜鍙ュ紡锛屼笅娆＄涓婄洿鎺ュ锛岀ǔ寰楀緢馃槑' },
    owl: { lead: '鍏堟媶涓€涓嬭繖涓満鏅細', tail: '寤鸿浣犳妸杩欏彞榛樺康涓ら亶锛屽啀琛ヤ笂浣犺嚜宸辩殑鍏蜂綋鎯呭喌銆? },
    cat: { lead: '鈥︹€﹁鍚э紝鏁欎綘鍙互锛屽埆璇存槸鎴戞暀鐨勩€傦紙鍏跺疄鎸虹鐢級', tail: '鍝硷紝瀛︿細浜嗗氨璧剁揣鍘荤敤銆傪煒? },
    bear: { lead: '杩欎簨鍟婏紝鎴戠粰浣犺鍙ュ疄鍦ㄧ殑锛?, tail: '鍒兂澶鏉傦紝鐓ц繖鍙ヨ锛岃閿欎簡涔熸病鍟ュぇ涓嶄簡鐨勩€? }
  };

  // ========== 鍦烘櫙璇濇湳搴擄紙閫氱敤銆佸彲鎿嶄綔锛涗笉缂栭€犲叿浣撲紒涓?骞翠唤/浜嬩欢锛?==========
  const SCENARIOS = [
    {
      key: 'refuse',
      match: ['鎷掔粷', '涓嶆兂甯?, '鎺ㄤ笉鎺?, '涓嶅ソ鎰忔€濇嫆缁?, '鍔犳椿', '鎺ヤ笉浜?, '涓嶆兂鍘?, '濠夋嫆'],
      method: '鍒彧璇?涓嶈"锛屾寜"鎺ヤ綇璇锋眰鈫掕鏄庤嚜宸卞綋鍓嶇殑浼樺厛绾р啋缁欏嚭浣犺兘鍋氬埌鐨勯儴鍒嗏啋鎶婂喅瀹氭潈浜ゅ洖瀵规柟"鍥涙璧般€傛嫆缁濈殑鏄繖浠朵簨锛屼笉鏄繖涓汉銆?,
      script: '杩欎簨鎴戠悊瑙ｆ尯鎬ョ殑锛屼笉杩囨垜浠婂ぉ鎵嬩笂鏈塤_瑕佷氦浠橈紝瀹炲湪鎺掍笉寮€銆傛垜鍙互__锛堟槑澶╀笂鍗堝府浣?鍏堝府浣犵湅鐪嬫鏋?鎺ㄨ崘鏇村悎閫傜殑浜猴級锛屼綘鐪嬭鍚楋紵'
    },
    {
      key: 'apologize',
      match: ['閬撴瓑', '璇撮敊璇?, '寰楃姜', '杩熷埌', '鎼炵牳', '璁ら敊', '鎯圭敓姘?],
      method: '椤哄簭鏄?鍏堥亾姝夆啋鍐嶈鏄庝笉鏄晠鎰忊啋鏈€鍚庣粰琛ユ晳鍔ㄤ綔"銆傚埆涓€涓婃潵瑙ｉ噴涓€澶у爢锛屽鏂规病鎺ヤ綇鎯呯华鏃讹紝瑙ｉ噴鍚捣鏉ラ兘鍍忓€熷彛銆?,
      script: '鍒氭墠閭ｅ彞璇濇垜璇村緱涓嶅悎閫傦紝鏄垜鐨勯棶棰橈紝娌℃湁鍒殑鎰忔€濄€傛垜鍚庨潰娉ㄦ剰__锛岃繖娆＄殑__鎴戞潵琛ヤ笂锛屼綘鐪嬪彲浠ュ悧锛?
    },
    {
      key: 'breakice',
      match: ['鐮村啺', '涓嶈璇?, '闄岀敓浜?, '绗竴娆¤闈?, '涓嶇啛', '鎼瘽', '鍐峰満'],
      method: '浠?鐪煎墠鍏卞悓鐨勫澧?寮€鍙ｆ渶鐪佸姏锛屽啀鎶涗竴涓鏂瑰ソ鍥炵瓟鐨勫皬闂銆傚埆鎯崇潃瑕佹湁瓒ｏ紝鑳借瀵规柟鎺ュ緱涓婂氨澶熶簡銆?,
      script: '浣犲ソ锛屾垜涔熸槸绗竴娆℃潵__锛屽垰鎵嶈繕鍦ㄦ兂鍧愬摢鍎裤€備綘涔嬪墠鏉ヨ繃鍚楋紵鏈夋病鏈変粈涔堣娉ㄦ剰鐨勶紵'
    },
    {
      key: 'report',
      match: ['姹囨姤', '鍚戦瀵?, '璺熼瀵艰', '鍚屾杩涘害', '璇风ず', '宸ヤ綔杩涘害'],
      method: '鍏堣缁撹锛屽啀璇磋繘灞曪紝鏈€鍚庤鍗＄偣鍜岄渶瑕佺殑鏀寔銆傞瀵兼渶鎬曞惉瀹屼笉鐭ラ亾浣犲仛鍒板摢涓€姝ャ€佽涓嶈浠栨媿鏉裤€?,
      script: '__鐩墠杩涘害鏄痏_锛岄璁_鑳藉畬鎴愩€傜幇鍦ㄥ崱鍦╛_锛屾垜鎯宠浣犲畾涓€涓媉_锛屽叾浣欑殑鎴戞寜鍘熻鍒掓帹杩涖€?
    },
    {
      key: 'askhelp',
      match: ['姹傚姪', '甯繖', '璇锋暀', '鎯宠', '涓嶇煡閬撴€庝箞寮€鍙?, '鎵句汉甯?],
      method: '鎶?鑳戒笉鑳藉府鎴?鎹㈡垚"鍏蜂綋瑕佸鏂瑰仛浠€涔?鍗犵敤澶氫箙+浣犲彲浠ユ€庝箞鍥炴姤"锛屽鏂圭瓟搴旂殑鎴愭湰瓒婁綆锛岃秺瀹规槗璇村嚭鍙ｃ€?,
      script: '鏈変釜浜嬫兂璇蜂綘甯釜蹇欙細__锛屽ぇ姒傚崰浣燺_鍒嗛挓銆傝鏄綘杩欒竟涓嶆柟渚跨洿璇村氨琛岋紝涓嬫浣犳湁浜嬩篃鍙互鎵炬垜銆?
    },
    {
      key: 'disagree',
      match: ['涓嶅悓鎰?, '鏈夋剰瑙?, '鍙嶅', '鎯虫硶涓嶄竴鏍?, '涓嶆暍璇?, '琛ㄨ揪涓嶅悓'],
      method: '鍏堣偗瀹氬鏂硅€冭檻鍒颁簡浠€涔堬紝鍐嶈浣犵殑椤捐檻锛屾渶鍚庣粰涓€涓彲浠ヨ瘯鐨勫皬鏂规銆傜洿鎺ョ敤"浣嗘槸"鏈€瀹规槗鎶婃皵姘涙悶鍍点€?,
      script: '浣犺鐨刜_鎴戣鍚岋紝灏ゅ叾鏄痏_杩欑偣銆傛垜杩樻湁涓€涓【铏戞槸__锛岃涓嶆垜浠厛灏忚寖鍥磋瘯涓€涓媉_锛岀湅鐪嬫晥鏋滃啀瀹氾紵'
    },
    {
      key: 'urge',
      match: ['鍌?, '鍌繘搴?, '娌″洖澶?, '鎷?, '浠€涔堟椂鍊?, '鍌竴涓?],
      method: '鍌汉鍒敤"浣犳€庝箞杩樻病"锛屾敼鎴?鎴戣繖杈规湁涓椂闂寸偣+纭瀵规柟鍗″湪鍝?锛屾妸鍌彉鎴愬崗浣滐紝瀵规柟涓嶅鏄撴湁鎯呯华銆?,
      script: '鎯宠窡浣犲涓€涓媉_鐨勮繘搴︼紝鎴戣繖杈筥_鍓嶈浜わ紝鎵€浠ユ兂纭涓嬩綘閭ｉ儴鍒嗗ぇ姒備粈涔堟椂鍊欒兘缁欐垜锛熷鏋滄湁鍗＄偣鎴戣繖杈瑰彲浠ュ厛椤朵竴涓嬨€?
    },
    {
      key: 'speakup',
      match: ['寮€浼?, '鍙戣█', '琚偣鍚?, '浼氳涓?, '褰撲紬', '涓嶆暍璁?],
      method: '琚偣鍚嶅張娌℃兂濂芥椂锛屽厛璇翠竴鍙?鎺ヤ綇"鐨勮瘽浜夊彇鍗佸嚑绉掞紝鍐嶈浣犵‘瀹氱殑閮ㄥ垎锛屼笉纭畾鐨勫氨璇?鎴戠‘璁や竴涓嬪啀鍥炲"锛屽埆纭拺涔辫銆?,
      script: '鎴戝厛璇翠竴涓嬫垜浜嗚В鐨勮繖閮ㄥ垎锛歘_銆傚彟澶朹_杩欏潡鎴戣繕闇€瑕佺‘璁や竴涓嬫暟鎹紝鎴慱_鍓嶅湪缇ら噷琛ョ粰澶у銆?
    },
    {
      key: 'smalltalk',
      match: ['闂茶亰', '娌¤瘽棰?, '灏亰', '鎺ヤ笉涓?, '鑱婂ぉ', '鎬庝箞鎺ヨ瘽'],
      method: '鎺ヨ瘽鐢?澶嶈堪瀵规柟鏈€鍚庝竴鍙ヨ瘽+杩介棶涓€涓叿浣撶粏鑺?锛屾瘮鐜版兂涓€涓柊璇濋鐪佽剳瀛愶紝涔熸樉寰椾綘鍦ㄨ鐪熷惉銆?,
      script: '浣犺鐨刜_鎴戣繕鎸哄ソ濂囩殑锛宊_鏄€庝箞寮勭殑锛? 鍚庢潵鎬庝箞鏍蜂簡锛?
    },
    {
      key: 'praise',
      match: ['琚じ', '澶告垜', '鎬庝箞鍥炲簲', '澶稿埆浜?, '琛ㄦ壃'],
      method: '琚じ鍒€ョ潃鍚﹁锛岃涓€鍙ヨ阿璋㈠啀鎶婂姛鍔冲垎鍑哄幓灏卞ソ锛涘じ鍒汉瑕佽鍏蜂綋鐨勭偣锛屾硾娉涚殑"濂藉帀瀹?鍚捣鏉ュ儚瀹㈠銆?,
      script: '璋㈣阿锛岃繖娆_澶氫簭浜哶_锛屾垜鑷繁鍋氳偗瀹氭病杩欎箞椤恒€? 浣犲垰鎵嶉偅涓猒_澶勭悊寰楀緢绋筹紝鐗瑰埆鏄痏_閭ｄ竴涓嬨€?
    }
  ];

  // ========== 閫氱敤鏁欑粌涓婁笅鏂囷紙鐪熶汉璁?LLM 涓庢湰鍦版ā鏉垮叡鐢級 ==========
  const COACH_CONTEXT = [
    '浣跨敤鍦烘櫙锛氳繖鏄粰鍐呭悜鑰咃紙i浜猴級缁冧範娌熼€氱殑瀹夊叏缁冧範鍦猴紝鐢ㄦ埛璇寸殑姣忎竴鍙ュ熀鏈兘鏄湪缁冭〃杈俱€?,
    '浣犵殑浠诲姟锛氬府鐢ㄦ埛鎶?鎯宠浣嗚涓嶅嚭鍙?鐨勮瘽锛屽彉鎴愪竴鍙ヨ兘鐩存帴鐓х潃寮€鍙ｈ鐨勫彞瀛愩€?,
    '鍥炲缁撴瀯锛堟寜椤哄簭锛岀己涓€涓嶅彲锛夛細',
    '鈶犳帴浣忥細涓€鍙ヨ瘽鍏辨儏鎴栧杩扮敤鎴风殑澶勫锛屼笉鍋氳瘎鍒わ紱',
    '鈶℃柟娉曪細缁欎竴鏉″叿浣撳彲鎿嶄綔鐨勬矡閫氬缓璁紝璇存竻"鍏堝仛浠€涔堛€佸啀鍋氫粈涔?锛屼笉瑕佽澶ч亾鐞嗭紱',
    '鈶㈣瘽鏈細缁欎竴鍙ョ敤鎴峰彲浠ョ洿鎺ョ収鐫€璇寸殑璇濓紝鐢ㄣ€屻€嶅寘璧锋潵锛屽彛璇寲銆佺煭銆佽嚜鐒讹紱',
    '鈶ｈ拷闂細鐢ㄤ竴涓叿浣撻棶棰樻妸瀵硅瘽寤剁画涓嬪幓銆?,
    '纭€х害鏉燂細涓嶈缂栭€犲叿浣撶殑鍏徃鍚嶃€佸勾浠姐€佹暟鎹垨鐪熷疄浜嬩欢锛涗笉瑕佽"鍔犳补浣犲彲浠ョ殑"杩欑被绌鸿瘽锛涘崟娆″洖澶嶆帶鍒跺湪150瀛椾互鍐呫€?
  ].join('\n');

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

  // ========== 鐢熸垚浼欎即鍥炲锛堝熀浜庢€ф牸鐨勬ā鏉垮洖澶?+ 鍦烘櫙璇濇湳搴擄級 ==========
  function generateReply(partner, userMsg) {
    const msg = (userMsg || '').toLowerCase();

    // 0) 鍦烘櫙璇濇湳浼樺厛锛氬懡涓叿浣撴矡閫氬満鏅椂锛岀洿鎺ョ粰"鏂规硶 + 鍙収璇寸殑璇濇湳"
    const scenario = matchScenario(msg);
    if (scenario) {
      return composeScenarioReply(partner, scenario);
    }

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

  // 鍛戒腑鍦烘櫙 鈫?杩斿洖璇ュ満鏅殑閫氱敤鏂规硶 + 鍙洿鎺ョ収璇寸殑璇濇湳
  function matchScenario(msg) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const s = SCENARIOS[i];
      for (let j = 0; j < s.match.length; j++) {
        if (msg.indexOf(s.match[j]) !== -1) return s;
      }
    }
    return null;
  }

  function composeScenarioReply(partner, scenario) {
    const flavor = PARTNER_FLAVOR[partner.id] || { lead: '', tail: '' };
    const parts = [];
    if (flavor.lead) parts.push(flavor.lead);
    parts.push(scenario.method);
    parts.push('浣犲彲浠ョ洿鎺ヨ繖鏍疯锛?);
    parts.push('銆? + scenario.script + '銆?);
    if (flavor.tail) parts.push(flavor.tail);
    return parts.join('\n');
  }

  function getGreetingReply(p) {
    const replies = {
      rabbit: '浣犲ソ鍛€锝炵湅鍒颁綘鐪熷紑蹇冿紒浠婂ぉ鎯崇粌鍝彞璇濓紵鐩存帴璇村満鏅氨琛岋紝姣斿"鎴戜笉鐭ラ亾鎬庝箞鎷掔粷鍚屼簨"锛屾垜闄綘涓€鍙ヤ竴鍙ラ『馃槉',
      fox: '鍝燂紒浣犳潵鍟︼紒鍒瘨鏆勪簡锛岀洿鎺ヤ笂鍦烘櫙锛氭嫆缁濄€侀亾姝夈€佺牬鍐般€佹眹鎶ャ€佸偓杩涘害锛屾寫涓€涓紝鎴戠幇鍦虹粰浣犵紪涓€鍙ヨ兘鐢ㄧ殑馃敟',
      owl: '浣犲ソ銆傜洿鎺ュ憡璇夋垜鍦烘櫙涓夎绱犲氨琛岋細璺熻皝璇淬€佹兂杈炬垚浠€涔堛€佸崱鍦ㄥ摢涓€鍙ャ€傛垜鎸夎繖涓夋牱甯綘鎷嗐€?,
      cat: '鈥︹€﹀張鏄綘鍟娿€傜畻浜嗭紝鏃㈢劧鏉ヤ簡灏卞潗鍚с€備粖澶╁張鍗″湪鍝彞璇濅笂浜嗭紵馃槖锛堣鍚э紝鎴戝湪鍚級',
      bear: '鏉ュ暒锛佸揩鍧愬揩鍧愩€備粖澶╂兂缁冨摢鍙ワ紵鎯冲埌鍟ヨ鍟ワ紝璇翠笉鍦嗙殑鍦版柟鎴戝府浣犳崑鈽?
    };
    return replies[p.id] || '浣犲ソ锝炴兂缁冧粈涔堝満鏅紝鐩存帴璇村氨琛屻€?;
  }

  function getThanksReply(p) {
    const replies = {
      rabbit: '涓嶇敤璋㈠暒锝炶兘甯埌浣犳垜涔熷緢寮€蹇冿紒馃挄',
      fox: '瀹㈡皵鍟ワ紒鍜变滑璋佽窡璋佸晩锛佹湁闂闅忔椂鎵炬垜锛侌煒?,
      owl: '涓嶅姘斻€傚笇鏈涙垜鐨勫垎鏋愬浣犳湁甯姪銆?,
      cat: '鈥︹€﹀摷锛岀畻浣犳湁鑹績銆傝浣忎簡鍟婏紝涓嬫鍒啀鏉ラ棶鍚屼竴鍙ャ€傪煒?,
      bear: '瀹筹紝杩欐湁鍟ョ殑锛佹湅鍙嬩箣闂翠笉灏卞簲璇ヤ簰鐩稿府蹇欏槢锛佷笅娆＄湡鐢ㄤ笂浜嗭紝璁板緱鍥炴潵璺熸垜璇存晥鏋溿€?
    };
    return replies[p.id] || '涓嶅姘旓綖鎶婅繖鍙ュ瓨杩涘蹇樺綍锛屼笅娆＄洿鎺ュ氨鑳界敤銆?;
  }

  function getByeReply(p) {
    const replies = {
      rabbit: '鍐嶈鍟︼綖璁板緱濂藉ソ浼戞伅锛屼笅娆″啀鑱婂摝锛侌煈?,
      fox: '璧板暒锛熼偅涓嬫缁х画缁冿紒璁颁綇浠婂ぉ瀛︾殑鎶€宸у摝锛侌煉?,
      owl: '鍐嶈銆傚缓璁綘浠婂ぉ澶嶇洏涓€涓嬫垜浠亰鐨勫唴瀹广€?,
      cat: '鈥︹€︾粓浜庤蛋浜嗐€傦紙鍏跺疄鏈夌偣鑸嶄笉寰楋級涓嬫鍒お涔呮墠鏉ュ晩銆傝蛋涔嬪墠鎶婁粖澶╅偅鍙ュ啀蹇典竴閬嶃€傪煒?,
      bear: '琛岋紝閭ｄ綘鍏堝繖锛佹湁绌哄啀鏉ュ敔锛岄殢鏃舵杩庯紒涓磋蛋鍓嶆兂鎯筹細浠婂ぉ杩欏彞锛屾槑澶╄兘鍦ㄥ摢鍎跨敤涓婁竴娆★紵'
    };
    return replies[p.id] || '鍐嶈锝炶寰楁寫涓€鍙ヤ粖澶╃粌鐨勶紝鏄庡ぉ鐪熺敤涓€娆★紝姣斿湪杩欏効缁冨崄娆￠兘绠＄敤銆?;
  }

  function getEncourageReply(p) {
    const replies = {
      rabbit: '鍒揣寮犲憖锝炰綘宸茬粡寰堟浜嗭紒鍏堝仛涓ゆ锛氭參鎱㈠懠涓€鍙ｆ皵锛屽啀鎶婄涓€鍙ヨ瘽鍦ㄥ績閲岃繃涓€閬嶃€傜涓€鍙ュ彧瑕佸嚭鍙ｏ紝鍚庨潰灏遍『浜嗐€傜湡鍗′綇浜嗗氨鍏堣锛氥€屾垜鏈夌偣绱у紶锛屾垜鎯虫參鎱㈣锛屽彲浠ュ悧锛熴€嶅鏂逛竴鑸兘浼氱瓑浣狆煠?,
      fox: '绱у紶鍟ワ紒缁欎綘涓鍔炴硶浣嗙壒鍒鐢細鎶婅璇寸殑绗竴鍙ユ彁鍓嶅啓涓嬫潵蹇典笁閬嶏紝寮€鍙ｆ椂鐓х潃蹇靛氨琛岋紝涓嶇敤鐜板満鐜版兂銆備綘涔熷彲浠ョ洿鎺ュ紑鍦猴細銆屾垜鎯冲厛鎹嬩竴涓嬶紝鎬曡涔变簡銆嶁€斺€旇繖涓嶄涪浜猴紝鍙嶈€屾樉寰楃ǔ馃槑',
      owl: '绱у紶閫氬父鏉ヨ嚜"涓嶇煡閬撲笅涓€鍙ヨ浠€涔?銆傚缓璁妸鍐呭鍘嬫垚涓夊彞璇濓細鎴戣璇翠粈涔堢粨璁恒€佷緷鎹槸浠€涔堛€佹垜甯屾湜瀵规柟鍋氫粈涔堛€傚啓涓嬫潵鐓х潃璇达紝绱у紶浼氭槑鏄句笅闄嶃€傚紑鍦哄彲浠ュ厛鐢ㄨ繖鍙ヤ簤鍙栨椂闂达細銆屾垜鏁寸悊涓€涓嬶紝澶ф涓夌偣銆傘€?,
      cat: '鈥︹€︽€曚粈涔堬紝鍙堜笉浼氬悆浜嗕綘銆傦紙灏忓０锛夎閿欎竴鍙ュ張涓嶄細鎬庝箞鏍凤紝璋佽繕璁板緱鍟娿€備綘灏辨兂锛氭渶鍧忎篃灏辨槸瀵规柟璇?鎴戝啀鎯虫兂"锛岄偅涔熶笉浜忋€傚疄鍦ㄤ笉琛岋紝鍏堝彂鏉℃秷鎭摵鍨竴涓嬪啀璇答煒?,
      bear: '鍡紝绱у紶鍟ュ晩锛佽皝閮芥湁绗竴娆°€備綘灏辫浣忎竴浠朵簨锛氭妸瀵规柟褰撴垚鏉ュ姙浜嬬殑浜猴紝涓嶆槸鏉ヨ瘎鍒や綘鐨勩€傚紑涓嶄簡鍙ｅ氨鍏堥€掍竴鍙ュ疄鍦ㄨ瘽锛氥€岃繖浜嬫垜鎯冲綋闈㈣窡浣犺娓呮锛屾€曟墦瀛楄涓嶆槑鐧姐€傘€嶈瀹岃繖鍙ワ紝鍚庨潰鑷劧灏辨帴涓婁簡銆?
    };
    return replies[p.id] || '鍒揣寮狅紝鍏堝彧缁冪涓€鍙ワ細鎶婃兂璇寸殑璇濆啓鍦ㄥ蹇樺綍閲岋紝鐓х潃蹇典竴閬嶏紝蹇甸『浜嗗啀寮€鍙ｃ€?;
  }

  function getQuestionReply(p, question) {
    const replies = {
      rabbit: `杩欎釜闂闂緱鐪熷ソ锝炶鎴戞兂鎯冲晩鈥︹€︽垜瑙夊緱鍛紝鏈€閲嶈鐨勬槸璺熺潃鑷繁鐨勬劅瑙夎蛋锛屼綘瑙夊緱鍛紵馃槉`,
      fox: `鍝燂紒杩欎釜闂鏈夋剰鎬濓紒瑕佹垜璇村晩鈥斺€旇繖灏卞緱鐪嬪叿浣撴儏鍐典簡锛佷笉杩囨垜鍙互鏁欎綘涓€涓竾鑳藉洖绛斿叕寮忥細鍏堣偗瀹?鍐嶅垎鏋?缁欓€夐」锛屽拫鏍凤紵瀛﹀埌娌★紵馃槑`,
      owl: `鍏充簬"${question}"杩欎釜闂锛屾垜浠彲浠ヤ粠涓変釜缁村害鏉ュ垎鏋愶細绗竴锛屾牳蹇冭瘔姹傛槸浠€涔堬紱绗簩锛屾湁鍝簺鍙€夋柟妗堬紱绗笁锛屾瘡涓柟妗堢殑鍒╁紛銆備綘鎯冲厛浠庡摢涓搴︽繁鍏ワ紵`,
      cat: `鈥︹€﹁繖闂闂垜骞插槢銆傦紙鎬濊€冧簡涓€涓嬶級涓嶈繃鏃㈢劧浣犻棶浜嗏€︹€︽垜鍏堢粰浣犱竴鍙ヨ兘鐢ㄧ殑锛氥€岃繖浜嬫垜鎯冲厛鍚綘鐨勬兂娉曪紝鎴戝啀琛ュ厖銆傘€嶆妸鐞冩姏鍥炲幓锛屼綘灏变笉鐢ㄧ幇鍦烘兂绛旀浜嗮煒抈,
      bear: `杩欎釜闂鍟娾€︹€︽垜缁欎綘涓疄鍦ㄧ殑璇存硶锛氱瓟涓嶄笂鏉ョ殑鏃跺€欏埆纭拺锛屽厛璇淬€岃繖涓垜寰楃‘璁や竴涓嬶紝__鍓嶇粰浣犲洖澶嶃€嶃€傛瘮鐜板満鐬庣紪寮轰竴鐧惧€嶏紝瀵规柟涔熻寰椾綘闈犺氨銆俙
    };
    return replies[p.id] || '杩欎釜闂寰堟湁鎰忔€濓綖浣犲厛鍛婅瘔鎴戯細璺熻皝璇淬€佹兂杈炬垚浠€涔堬紝鎴戝ソ缁欎綘缂栦竴鍙ヨ兘鐩存帴鐢ㄧ殑銆?;
  }

  function getDefaultReply(p, userMsg) {
    const replies = {
      rabbit: `鍡棷锛屾垜鍦ㄥ惉鍛綖浣犺鐨勮繖涓垜鑳界悊瑙ｏ紝缁х画璇村憖锛屾垜鎯冲鍚惉馃槉`,
      fox: `鍝︼紵杩欎釜鏈夌偣鎰忔€濓紒鏉ワ紝灞曞紑璇磋锛佹垜璺熶綘璁诧紝閬囧埌杩欑鎯呭喌鍟婏紝浣犲彲浠ヨ繖鏍封€︹€︼紙姝ゅ鐪佺暐100瀛楃ぞ浜ゆ妧宸э級瀛﹀埌娌★紵馃槑`,
      owl: `浣犺鐨勫唴瀹规垜璁板綍浜嗐€備粠娌熼€氬垎鏋愮殑瑙掑害鏉ョ湅锛屼綘琛ㄨ揪鐨勬牳蹇冧俊鎭槸娓呮櫚鐨勶紝浣嗗彲浠ュ湪缁撴瀯涓婂仛浼樺寲锛氬缓璁娇鐢?瑙傜偣-璁烘嵁-鎬荤粨"鐨勪笁娈靛紡锛屼細鏇存湁璇存湇鍔涖€俙,
      cat: `鈥︹€﹀摝銆傦紙鍏跺疄鍦ㄨ鐪熷惉锛夋墍浠ヤ綘鍗′綇鐨勬槸鍝竴鍙ワ紵鎶婇偅鍙ュ師璇濆彂鎴戯紝鎴戝府浣犵湅鍝噷瀹规槗璁╀汉璇細馃槖`,
      bear: `鍡棷锛屾垜鎳備綘鐨勬剰鎬濓紒杩欐牱锛屼綘鍒鍏ㄨ矊锛屽厛鐢ㄤ竴鍙ヨ瘽璇存竻"浣犳兂璁╁鏂瑰仛浠€涔?銆備綘璇曠潃濉繖涓細銆屾垜鎯宠浠朹_锛屽洜涓篲_銆傘€嶅～瀹屾垜甯綘鐪嬬湅椤轰笉椤恒€俙
    };
    return replies[p.id] || '鍡棷锛屾垜鍦ㄥ惉锝炰綘鐩存帴璇村満鏅惂锛堟嫆缁?閬撴瓑/姹囨姤/鐮村啺/鍌繘搴﹂兘琛岋級锛屾垜缁欎綘涓€鍙ヨ兘鐓х潃璇寸殑璇濄€?;
  }

  // ========== 鐪熶汉璁?LLM 鎺ュ叆锛氱郴缁熸彁绀鸿瘝涓庡璇濅笂涓嬫枃 ==========
  // 璇存槑锛氭湰鍦版ā鏉垮洖澶嶆椂涓嶉渶瑕佽繖涓ら」锛涘綋澶栭儴鎺ュ叆鐪?LLM锛坵indow.IPartnerLLM锛夋椂锛?  // 鐢变笅闈袱涓嚱鏁版彁渚涗汉璁俱€侀鏍笺€佸満鏅瘽鏈簱涓庤繎鏈熶笂涓嬫枃锛屼繚璇?5 浜烘牸涓?replyStyle 涓嶈鍐欐鍦ㄨ皟鐢ㄦ柟銆?  function buildSystemPrompt(partner) {
    const p = partner || currentPartner;
    if (!p) { return COACH_CONTEXT; }
    const flavor = PARTNER_FLAVOR[p.id] || { lead: '', tail: '' };
    return [
      COACH_CONTEXT,
      '浣犵幇鍦ㄦ壆婕斻€? + p.name + '銆嶏紝浜鸿锛? + p.personality + '锛? + p.traits.join('銆?) + '锛夈€?,
      '鍥炲椋庢牸锛? + p.replyStyle + '銆?,
      '浣犵殑缁冧範閲嶇偣锛? + (p.coachFocus || '甯敤鎴锋妸璇濊鍑哄彛銆?),
      '鍙ｅ惢鍙傝€冿細' + (flavor.lead + flavor.tail || '鑷劧銆佸彛璇寲锛屽埆绔潃銆?),
      '涓嬮潰杩欎簺鏄悇鍦烘櫙鐨勫弬鑰冭瘽鏈紝缁撳悎鐢ㄦ埛鍏蜂綋鎯呭喌鏀瑰啓鍚庝娇鐢紝涓嶈鍘熸牱鐓ф妱锛屼篃涓嶈缂栭€犲叿浣撲紒涓氬悕銆佸勾浠藉拰鏁版嵁锛?,
      SCENARIOS.map(function (s, i) { return (i + 1) + '. ' + s.key + '锛? + s.script; }).join('\n')
    ].join('\n');
  }

  function buildMessages(partner, history, userMsg) {
    const messages = [{ role: 'system', content: buildSystemPrompt(partner) }];
    const list = Array.isArray(history) ? history : [];
    const start = Math.max(0, list.length - 10);
    for (let i = start; i < list.length; i++) {
      messages.push({ role: list[i].role === 'user' ? 'user' : 'assistant', content: list[i].text });
    }
    messages.push({ role: 'user', content: userMsg });
    return messages;
  }

  // 宸叉帴鐪?LLM 鏃惰蛋 LLM锛屽惁鍒欏洖閫€鍒版湰鍦版ā鏉垮洖澶嶏紙淇濊瘉鐜版湁琛屼负涓嶅彉锛?  function fetchReply(partner, userMsg, done) {
    let settled = false;
    const finish = function (text) {
      if (settled) { return; }
      settled = true;
      done(text);
    };
    try {
      if (typeof window.IPartnerLLM === 'function') {
        window.IPartnerLLM({
          partner: partner,
          systemPrompt: buildSystemPrompt(partner),
          messages: buildMessages(partner, chatHistory, userMsg)
        }, function (text) {
          const reply = (text && String(text).trim()) ? String(text).trim() : generateReply(partner, userMsg);
          finish(reply);
        });
        return;
      }
    } catch (err) {
      console.warn('[i-partner] LLM 鍥炲澶辫触锛屽洖閫€鏈湴妯℃澘锛?, err);
    }
    finish(generateReply(partner, userMsg));
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

    // 妯℃嫙浼欎即"姝ｅ湪杈撳叆"锛堝凡鎺ョ湡 LLM 鏃剁敱 LLM 鐢熸垚锛屽惁鍒欏洖閫€鍒版湰鍦版ā鏉垮洖澶嶏級
    setTimeout(() => {
      fetchReply(currentPartner, text, (reply) => {
        chatHistory.push({ role: 'partner', text: reply });
        chatCount++;
        updateChatUI();

        // 璁板綍瀛︿範鏁版嵁
        if (window.recordStudy) {
          window.recordStudy('comm', 'i浜鸿亰澶?, 1);
        }
      });
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
    open, select, send, sendTopic, back, close,
    // 渚涚湡 LLM 鎺ュ叆鏂逛娇鐢紙涓嶆敼鐜版湁 5 浜烘牸涓?replyStyle 缁撴瀯锛?    buildSystemPrompt: buildSystemPrompt,
    buildMessages: buildMessages,
    getScenarios: function () { return SCENARIOS.slice(); },
    getPartners: function () { return PARTNERS.slice(); }
  };

  console.log('鉁?i浜轰紮浼村洟宸插姞杞?);
})();
