/* ============================================================
 * xt-region.js —— 中国省 / 市 / 区数据 + 选择辅助 + 逆地理编码
 * 批次：R86-B（个人信息页改造 · 需求4 地区选择）
 *       R130（位置选择组件升级真地图：Leaflet + 腾讯瓦片）
 *
 * 设计约束：
 *   1) ES2017 上限（仅用 var + function，老 WebView / Chrome 50+ 可解析）：
 *      无箭头函数、无可选链、无空值合并、无顶层 await、无模板字符串。
 *   2) 全部挂在 window.XT_REGION / window.XT_LOC_PICK 上，不污染全局；
 *      R130 起按需懒加载本地化的 Leaflet 1.9.4（assets/leaflet/，
 *      相对路径注入，禁止任何 CDN 外链）。
 *   3) 数据体量：34 个省级 → 全部地级市；区县级只覆盖直辖市与主要城市
 *      （够用即可）。没有区县数据的城市，选到「市」即完成。
 *   4) 逆地理编码走 JSONP（绕开 CORS），高德 / 腾讯需 Key，
 *      Nominatim 免 Key 作为兜底。任何失败都不抛异常，回调给 null。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 省 / 市 / 区 数据 ----------------
   * 结构：[ { n: 省名, c: [ { n: 市名, d: [区/县...] }, ... ] }, ... ]
   * d 省略表示无下一级（选到市即结束）。
   */
  var DATA = [
    { n: '北京市', c: [{ n: '北京市', d: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区', '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'] }] },
    { n: '天津市', c: [{ n: '天津市', d: ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'] }] },
    { n: '上海市', c: [{ n: '上海市', d: ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '闵行区', '宝山区', '嘉定区', '浦东新区', '金山区', '松江区', '青浦区', '奉贤区', '崇明区'] }] },
    { n: '重庆市', c: [{ n: '重庆市', d: ['渝中区', '江北区', '南岸区', '九龙坡区', '沙坪坝区', '大渡口区', '渝北区', '巴南区', '北碚区', '两江新区', '万州区', '涪陵区', '永川区', '合川区', '江津区', '璧山区'] }] },
    { n: '河北省', c: [
      { n: '石家庄市', d: ['长安区', '桥西区', '新华区', '井陉矿区', '裕华区', '藁城区', '鹿泉区', '栾城区', '正定县'] },
      { n: '唐山市' }, { n: '秦皇岛市' }, { n: '邯郸市' }, { n: '邢台市' }, { n: '保定市' },
      { n: '张家口市' }, { n: '承德市' }, { n: '沧州市' }, { n: '廊坊市' }, { n: '衡水市' }
    ] },
    { n: '山西省', c: [
      { n: '太原市', d: ['小店区', '迎泽区', '杏花岭区', '尖草坪区', '万柏林区', '晋源区', '清徐县', '阳曲县', '古交市'] },
      { n: '大同市' }, { n: '阳泉市' }, { n: '长治市' }, { n: '晋城市' }, { n: '朔州市' },
      { n: '晋中市' }, { n: '运城市' }, { n: '忻州市' }, { n: '临汾市' }, { n: '吕梁市' }
    ] },
    { n: '内蒙古自治区', c: [
      { n: '呼和浩特市', d: ['新城区', '回民区', '玉泉区', '赛罕区', '托克托县', '和林格尔县', '清水河县', '武川县'] },
      { n: '包头市' }, { n: '乌海市' }, { n: '赤峰市' }, { n: '通辽市' }, { n: '鄂尔多斯市' },
      { n: '呼伦贝尔市' }, { n: '巴彦淖尔市' }, { n: '乌兰察布市' }, { n: '兴安盟' },
      { n: '锡林郭勒盟' }, { n: '阿拉善盟' }
    ] },
    { n: '辽宁省', c: [
      { n: '沈阳市', d: ['和平区', '沈河区', '大东区', '皇姑区', '铁西区', '苏家屯区', '浑南区', '沈北新区', '于洪区'] },
      { n: '大连市', d: ['中山区', '西岗区', '沙河口区', '甘井子区', '旅顺口区', '金州区', '普兰店区', '瓦房店市', '庄河市'] },
      { n: '鞍山市' }, { n: '抚顺市' }, { n: '本溪市' }, { n: '丹东市' }, { n: '锦州市' },
      { n: '营口市' }, { n: '阜新市' }, { n: '辽阳市' }, { n: '盘锦市' }, { n: '铁岭市' },
      { n: '朝阳市' }, { n: '葫芦岛市' }
    ] },
    { n: '吉林省', c: [
      { n: '长春市', d: ['南关区', '宽城区', '朝阳区', '二道区', '绿园区', '双阳区', '九台区', '农安县'] },
      { n: '吉林市' }, { n: '四平市' }, { n: '辽源市' }, { n: '通化市' }, { n: '白山市' },
      { n: '松原市' }, { n: '白城市' }, { n: '延边朝鲜族自治州' }
    ] },
    { n: '黑龙江省', c: [
      { n: '哈尔滨市', d: ['道里区', '南岗区', '道外区', '平房区', '松北区', '香坊区', '呼兰区', '阿城区', '双城区'] },
      { n: '齐齐哈尔市' }, { n: '鸡西市' }, { n: '鹤岗市' }, { n: '双鸭山市' }, { n: '大庆市' },
      { n: '伊春市' }, { n: '佳木斯市' }, { n: '七台河市' }, { n: '牡丹江市' }, { n: '黑河市' },
      { n: '绥化市' }, { n: '大兴安岭地区' }
    ] },
    { n: '江苏省', c: [
      { n: '南京市', d: ['玄武区', '秦淮区', '建邺区', '鼓楼区', '浦口区', '栖霞区', '雨花台区', '江宁区', '六合区', '溧水区', '高淳区'] },
      { n: '无锡市', d: ['梁溪区', '锡山区', '惠山区', '滨湖区', '新吴区', '江阴市', '宜兴市'] },
      { n: '徐州市' }, { n: '常州市' },
      { n: '苏州市', d: ['姑苏区', '虎丘区', '吴中区', '相城区', '吴江区', '工业园区', '常熟市', '张家港市', '昆山市', '太仓市'] },
      { n: '南通市' }, { n: '连云港市' }, { n: '淮安市' }, { n: '盐城市' }, { n: '扬州市' },
      { n: '镇江市' }, { n: '泰州市' }, { n: '宿迁市' }
    ] },
    { n: '浙江省', c: [
      { n: '杭州市', d: ['上城区', '拱墅区', '西湖区', '滨江区', '萧山区', '余杭区', '临平区', '钱塘区', '富阳区', '临安区', '桐庐县', '淳安县', '建德市'] },
      { n: '宁波市', d: ['海曙区', '江北区', '北仑区', '镇海区', '鄞州区', '奉化区', '象山县', '宁海县', '余姚市', '慈溪市'] },
      { n: '温州市' }, { n: '嘉兴市' }, { n: '湖州市' }, { n: '绍兴市' }, { n: '金华市' },
      { n: '衢州市' }, { n: '舟山市' }, { n: '台州市' }, { n: '丽水市' }
    ] },
    { n: '安徽省', c: [
      { n: '合肥市', d: ['瑶海区', '庐阳区', '蜀山区', '包河区', '高新区', '经开区', '肥东县', '肥西县', '长丰县', '巢湖市'] },
      { n: '芜湖市' }, { n: '蚌埠市' }, { n: '淮南市' }, { n: '马鞍山市' }, { n: '淮北市' },
      { n: '铜陵市' }, { n: '安庆市' }, { n: '黄山市' }, { n: '阜阳市' }, { n: '宿州市' },
      { n: '滁州市' }, { n: '六安市' }, { n: '亳州市' }, { n: '池州市' }, { n: '宣城市' }
    ] },
    { n: '福建省', c: [
      { n: '福州市', d: ['鼓楼区', '台江区', '仓山区', '马尾区', '晋安区', '长乐区', '闽侯县', '连江县', '福清市'] },
      { n: '厦门市', d: ['思明区', '湖里区', '集美区', '海沧区', '同安区', '翔安区'] },
      { n: '莆田市' }, { n: '三明市' }, { n: '泉州市' }, { n: '漳州市' }, { n: '南平市' },
      { n: '龙岩市' }, { n: '宁德市' }
    ] },
    { n: '江西省', c: [
      { n: '南昌市', d: ['东湖区', '西湖区', '青云谱区', '青山湖区', '新建区', '红谷滩区', '南昌县', '安义县', '进贤县'] },
      { n: '景德镇市' }, { n: '萍乡市' }, { n: '九江市' }, { n: '新余市' }, { n: '鹰潭市' },
      { n: '赣州市' }, { n: '吉安市' }, { n: '宜春市' }, { n: '抚州市' }, { n: '上饶市' }
    ] },
    { n: '山东省', c: [
      { n: '济南市', d: ['历下区', '市中区', '槐荫区', '天桥区', '历城区', '长清区', '章丘区', '济阳区', '莱芜区', '钢城区'] },
      { n: '青岛市', d: ['市南区', '市北区', '李沧区', '崂山区', '黄岛区', '城阳区', '即墨区', '胶州市', '平度市', '莱西市'] },
      { n: '淄博市' }, { n: '枣庄市' }, { n: '东营市' }, { n: '烟台市' }, { n: '潍坊市' },
      { n: '济宁市' }, { n: '泰安市' }, { n: '威海市' }, { n: '日照市' }, { n: '临沂市' },
      { n: '德州市' }, { n: '聊城市' }, { n: '滨州市' }, { n: '菏泽市' }
    ] },
    { n: '河南省', c: [
      { n: '郑州市', d: ['中原区', '二七区', '管城区', '金水区', '上街区', '惠济区', '中牟县', '巩义市', '荥阳市', '新密市', '新郑市', '登封市'] },
      { n: '开封市' }, { n: '洛阳市' }, { n: '平顶山市' }, { n: '安阳市' }, { n: '鹤壁市' },
      { n: '新乡市' }, { n: '焦作市' }, { n: '濮阳市' }, { n: '许昌市' }, { n: '漯河市' },
      { n: '三门峡市' }, { n: '南阳市' }, { n: '商丘市' }, { n: '信阳市' }, { n: '周口市' },
      { n: '驻马店市' }, { n: '济源市' }
    ] },
    { n: '湖北省', c: [
      { n: '武汉市', d: ['江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区', '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区'] },
      { n: '黄石市' }, { n: '十堰市' }, { n: '宜昌市' }, { n: '襄阳市' }, { n: '鄂州市' },
      { n: '荆门市' }, { n: '孝感市' }, { n: '荆州市' }, { n: '黄冈市' }, { n: '咸宁市' },
      { n: '随州市' }, { n: '恩施土家族苗族自治州' }, { n: '仙桃市' }, { n: '潜江市' },
      { n: '天门市' }, { n: '神农架林区' }
    ] },
    { n: '湖南省', c: [
      { n: '长沙市', d: ['芙蓉区', '天心区', '岳麓区', '开福区', '雨花区', '望城区', '长沙县', '浏阳市', '宁乡市'] },
      { n: '株洲市' }, { n: '湘潭市' }, { n: '衡阳市' }, { n: '邵阳市' }, { n: '岳阳市' },
      { n: '常德市' }, { n: '张家界市' }, { n: '益阳市' }, { n: '郴州市' }, { n: '永州市' },
      { n: '怀化市' }, { n: '娄底市' }, { n: '湘西土家族苗族自治州' }
    ] },
    { n: '广东省', c: [
      { n: '广州市', d: ['天河区', '越秀区', '荔湾区', '海珠区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '增城区', '从化区'] },
      { n: '深圳市', d: ['福田区', '罗湖区', '南山区', '宝安区', '龙岗区', '盐田区', '龙华区', '坪山区', '光明区', '大鹏新区'] },
      { n: '珠海市', d: ['香洲区', '斗门区', '金湾区'] },
      { n: '汕头市' },
      { n: '佛山市', d: ['禅城区', '南海区', '顺德区', '三水区', '高明区'] },
      { n: '韶关市' }, { n: '湛江市' }, { n: '肇庆市' }, { n: '江门市' }, { n: '茂名市' },
      { n: '惠州市' }, { n: '梅州市' }, { n: '汕尾市' }, { n: '河源市' }, { n: '阳江市' },
      { n: '清远市' },
      { n: '东莞市', d: ['莞城街道', '南城街道', '万江街道', '虎门镇', '长安镇', '厚街镇', '常平镇', '塘厦镇', '松山湖'] },
      { n: '中山市', d: ['石岐街道', '东区街道', '西区街道', '南区街道', '小榄镇', '古镇镇', '三乡镇'] },
      { n: '潮州市' }, { n: '揭阳市' }, { n: '云浮市' }
    ] },
    { n: '广西壮族自治区', c: [
      { n: '南宁市', d: ['兴宁区', '青秀区', '江南区', '西乡塘区', '良庆区', '邕宁区', '武鸣区', '横州市'] },
      { n: '柳州市' }, { n: '桂林市' }, { n: '梧州市' }, { n: '北海市' }, { n: '防城港市' },
      { n: '钦州市' }, { n: '贵港市' }, { n: '玉林市' }, { n: '百色市' }, { n: '贺州市' },
      { n: '河池市' }, { n: '来宾市' }, { n: '崇左市' }
    ] },
    { n: '海南省', c: [
      { n: '海口市', d: ['龙华区', '秀英区', '琼山区', '美兰区'] },
      { n: '三亚市' }, { n: '三沙市' }, { n: '儋州市' }
    ] },
    { n: '四川省', c: [
      { n: '成都市', d: ['锦江区', '青羊区', '金牛区', '武侯区', '成华区', '龙泉驿区', '青白江区', '新都区', '温江区', '双流区', '郫都区', '高新区', '天府新区'] },
      { n: '自贡市' }, { n: '攀枝花市' }, { n: '泸州市' }, { n: '德阳市' }, { n: '绵阳市' },
      { n: '广元市' }, { n: '遂宁市' }, { n: '内江市' }, { n: '乐山市' }, { n: '南充市' },
      { n: '眉山市' }, { n: '宜宾市' }, { n: '广安市' }, { n: '达州市' }, { n: '雅安市' },
      { n: '巴中市' }, { n: '资阳市' }, { n: '阿坝藏族羌族自治州' }, { n: '甘孜藏族自治州' },
      { n: '凉山彝族自治州' }
    ] },
    { n: '贵州省', c: [
      { n: '贵阳市', d: ['南明区', '云岩区', '花溪区', '乌当区', '白云区', '观山湖区', '清镇市', '修文县', '息烽县', '开阳县'] },
      { n: '六盘水市' }, { n: '遵义市' }, { n: '安顺市' }, { n: '毕节市' }, { n: '铜仁市' },
      { n: '黔西南布依族苗族自治州' }, { n: '黔东南苗族侗族自治州' }, { n: '黔南布依族苗族自治州' }
    ] },
    { n: '云南省', c: [
      { n: '昆明市', d: ['五华区', '盘龙区', '官渡区', '西山区', '呈贡区', '晋宁区', '安宁市', '宜良县', '嵩明县'] },
      { n: '曲靖市' }, { n: '玉溪市' }, { n: '保山市' }, { n: '昭通市' }, { n: '丽江市' },
      { n: '普洱市' }, { n: '临沧市' }, { n: '楚雄彝族自治州' }, { n: '红河哈尼族彝族自治州' },
      { n: '文山壮族苗族自治州' }, { n: '西双版纳傣族自治州' }, { n: '大理白族自治州' },
      { n: '德宏傣族景颇族自治州' }, { n: '怒江傈僳族自治州' }, { n: '迪庆藏族自治州' }
    ] },
    { n: '西藏自治区', c: [
      { n: '拉萨市', d: ['城关区', '堆龙德庆区', '达孜区', '林周县', '当雄县', '尼木县', '曲水县', '墨竹工卡县'] },
      { n: '日喀则市' }, { n: '昌都市' }, { n: '林芝市' }, { n: '山南市' }, { n: '那曲市' },
      { n: '阿里地区' }
    ] },
    { n: '陕西省', c: [
      { n: '西安市', d: ['新城区', '碑林区', '莲湖区', '灞桥区', '未央区', '雁塔区', '阎良区', '临潼区', '长安区', '高陵区', '鄠邑区'] },
      { n: '铜川市' }, { n: '宝鸡市' }, { n: '咸阳市' }, { n: '渭南市' }, { n: '延安市' },
      { n: '汉中市' }, { n: '榆林市' }, { n: '安康市' }, { n: '商洛市' }
    ] },
    { n: '甘肃省', c: [
      { n: '兰州市', d: ['城关区', '七里河区', '西固区', '安宁区', '红古区', '榆中县', '皋兰县', '永登县'] },
      { n: '嘉峪关市' }, { n: '金昌市' }, { n: '白银市' }, { n: '天水市' }, { n: '武威市' },
      { n: '张掖市' }, { n: '平凉市' }, { n: '酒泉市' }, { n: '庆阳市' }, { n: '定西市' },
      { n: '陇南市' }, { n: '临夏回族自治州' }, { n: '甘南藏族自治州' }
    ] },
    { n: '青海省', c: [
      { n: '西宁市', d: ['城东区', '城中区', '城西区', '城北区', '湟中区', '大通县', '湟源县'] },
      { n: '海东市' }, { n: '海北藏族自治州' }, { n: '黄南藏族自治州' }, { n: '海南藏族自治州' },
      { n: '果洛藏族自治州' }, { n: '玉树藏族自治州' }, { n: '海西蒙古族藏族自治州' }
    ] },
    { n: '宁夏回族自治区', c: [
      { n: '银川市', d: ['兴庆区', '金凤区', '西夏区', '永宁县', '贺兰县', '灵武市'] },
      { n: '石嘴山市' }, { n: '吴忠市' }, { n: '固原市' }, { n: '中卫市' }
    ] },
    { n: '新疆维吾尔自治区', c: [
      { n: '乌鲁木齐市', d: ['天山区', '沙依巴克区', '新市区', '水磨沟区', '头屯河区', '米东区', '乌鲁木齐县'] },
      { n: '克拉玛依市' }, { n: '吐鲁番市' }, { n: '哈密市' }, { n: '昌吉回族自治州' },
      { n: '博尔塔拉蒙古自治州' }, { n: '巴音郭楞蒙古自治州' }, { n: '阿克苏地区' },
      { n: '克孜勒苏柯尔克孜自治州' }, { n: '喀什地区' }, { n: '和田地区' },
      { n: '伊犁哈萨克自治州' }, { n: '塔城地区' }, { n: '阿勒泰地区' }
    ] },
    { n: '台湾省', c: [{ n: '台北市' }, { n: '新北市' }, { n: '桃园市' }, { n: '台中市' }, { n: '台南市' }, { n: '高雄市' }] },
    { n: '香港特别行政区', c: [{ n: '香港特别行政区', d: ['中西区', '湾仔区', '东区', '南区', '油尖旺区', '深水埗区', '九龙城区', '黄大仙区', '观塘区', '荃湾区', '屯门区', '元朗区', '北区', '大埔区', '西贡区', '沙田区', '葵青区', '离岛区'] }] },
    { n: '澳门特别行政区', c: [{ n: '澳门特别行政区', d: ['花地玛堂区', '花王堂区', '望德堂区', '大堂区', '风顺堂区', '嘉模堂区', '圣方济各堂区', '路氹填海区'] }] }
  ];

  /* ---------------- 逆地理编码配置（按需填 Key） ----------------
   * provider: 'amap'（高德，中文地址最准，需 Key）
   *           'tencent'（腾讯位置服务，需 Key）
   *           'nominatim'（OpenStreetMap，免 Key，国内网络可能被墙）
   * 未配置 Key 时自动降级到 nominatim；都失败则回调 null，由调用方降级为手动选择。
   */
  var GEO = {
    provider: 'tencent',
    amapKey: '',
    tencentKey: 'RRTBZ-GNGKQ-3KD5W-2SS5K-YIHG5-S4BAP',
    timeoutMs: 9000
  };

  /* ---------------- 数据访问 ---------------- */
  function provinces() {
    var out = [], i;
    for (i = 0; i < DATA.length; i++) out.push(DATA[i].n);
    return out;
  }

  function citiesOf(province) {
    var i, j, out = [];
    for (i = 0; i < DATA.length; i++) {
      if (DATA[i].n !== province) continue;
      for (j = 0; j < DATA[i].c.length; j++) out.push(DATA[i].c[j].n);
      return out;
    }
    return out;
  }

  function districtsOf(province, city) {
    var i, j;
    for (i = 0; i < DATA.length; i++) {
      if (DATA[i].n !== province) continue;
      for (j = 0; j < DATA[i].c.length; j++) {
        if (DATA[i].c[j].n === city) return (DATA[i].c[j].d || []).slice(0);
      }
    }
    return [];
  }

  /** 拼接展示文本：直辖市与省同名时去重，形如「广东省 广州市 天河区」。 */
  function textOf(province, city, district) {
    var parts = [], i, seen = {};
    var arr = [province, city, district];
    for (i = 0; i < arr.length; i++) {
      var v = String(arr[i] || '').trim();
      if (!v || seen[v]) continue;
      seen[v] = 1;
      parts.push(v);
    }
    return parts.join(' ');
  }

  /** 关键词搜索：省 / 市 / 区 任意一级命中即返回，最多 limit 条。 */
  function search(keyword, limit) {
    var kw = String(keyword || '').trim();
    var max = limit || 40;
    if (!kw) return [];
    var out = [], i, j, k;
    for (i = 0; i < DATA.length && out.length < max; i++) {
      var p = DATA[i].n;
      for (j = 0; j < DATA[i].c.length && out.length < max; j++) {
        var c = DATA[i].c[j];
        var hitP = p.indexOf(kw) >= 0;
        var hitC = c.n.indexOf(kw) >= 0;
        if (hitP || hitC) {
          out.push({ province: p, city: c.n, district: '', text: textOf(p, c.n, '') });
        }
        var ds = c.d || [];
        for (k = 0; k < ds.length && out.length < max; k++) {
          if (ds[k].indexOf(kw) >= 0) {
            out.push({ province: p, city: c.n, district: ds[k], text: textOf(p, c.n, ds[k]) });
          }
        }
      }
    }
    return out;
  }

  /** 把「广东省 广州市 天河区」这类已存文本解析回 {province, city, district}（尽力而为）。 */
  function parseText(txt) {
    var parts = String(txt || '').split(/[\s/·,，]+/).filter(function (x) { return !!x; });
    var res = { province: '', city: '', district: '' };
    if (!parts.length) return res;
    var i, j, k;
    for (i = 0; i < DATA.length; i++) {
      if (DATA[i].n !== parts[0]) continue;
      res.province = DATA[i].n;
      if (parts.length < 2) { res.city = DATA[i].c.length ? DATA[i].c[0].n : ''; return res; }
      for (j = 0; j < DATA[i].c.length; j++) {
        if (DATA[i].c[j].n !== parts[1]) continue;
        res.city = DATA[i].c[j].n;
        var ds = DATA[i].c[j].d || [];
        for (k = 0; k < ds.length; k++) { if (ds[k] === parts[2]) { res.district = ds[k]; break; } }
        return res;
      }
      return res;
    }
    return res;
  }

  /* ---------------- 逆地理编码（JSONP） ---------------- */
  var _geoSeq = 0;

  function _jsonp(url, cbName, timeoutMs, done) {
    var script = document.createElement('script');
    var finished = false;
    var timer = null;
    function cleanup() {
      try { if (timer) clearTimeout(timer); } catch (e) {}
      try { if (window[cbName]) { window[cbName] = undefined; delete window[cbName]; } } catch (e2) {}
      try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e3) {}
    }
    function finish(val) {
      if (finished) return;
      finished = true;
      cleanup();
      done(val);
    }
    window[cbName] = function (data) { finish(data || null); };
    script.charset = 'UTF-8';
    script.src = url;
    script.onerror = function () { finish(null); };
    timer = setTimeout(function () { finish(null); }, timeoutMs || 9000);
    var head = document.getElementsByTagName('head')[0] || document.documentElement;
    head.appendChild(script);
  }

  function _first(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Object.prototype.toString.call(v) === '[object Array]') return v.length ? String(v[0] || '') : '';
    return String(v);
  }

  /**
   * 规整腾讯 POI 数组 → [{title, address, category, distance, lat, lng}]。
   * distance 保留腾讯原始值（可能是数字或文案），绝不自行按经纬度计算。
   * R104 项3：额外保留腾讯 POI 的经纬度（p.location.lat/lng），供 openPicker 选中 POI 时回传；
   *           无坐标 → null（不臆造）。新增字段不影响既有纯文字消费方。
   * @param {Array} pa
   * @returns {Array}
   */
  function _poiList(pa) {
    if (Object.prototype.toString.call(pa) !== '[object Array]') return [];
    var out = [], i, p;
    for (i = 0; i < pa.length; i++) {
      p = pa[i] || {};
      if (!p.title) continue;
      var loc = p.location || {};
      var pla = Number(loc.lat), pln = Number(loc.lng);
      out.push({
        title: String(p.title),
        address: p.address ? String(p.address) : '',
        category: p.category ? String(p.category) : '',
        distance: (p._distance == null || String(p._distance) === '') ? '' : String(p._distance),
        lat: (loc.lat != null && String(loc.lat) !== '' && isFinite(pla)) ? pla : null,
        lng: (loc.lng != null && String(loc.lng) !== '' && isFinite(pln)) ? pln : null
      });
    }
    return out;
  }

  /**
   * 解析腾讯 WebService 逆地理结果（geocoder/v1）。
   * 目标：街道级地址 + 周边 POI。
   * @param {Object} d 腾讯原始响应
   * @returns {Object|null} { text, recommend, province, city, district, street, pois }
   */
  function _parseTencentGeo(d) {
    if (!d) return null;
    try {
      var rs = (d.result && typeof d.result === 'object') ? d.result : d;
      var rc = rs.address_component || {};
      var fa = rs.formatted_addresses || {};
      var street = _first(rc.street);
      var num = _first(rc.street_number);
      if (street && num) street = '' + street + ' ' + num;
      return {
        text: _first(rs.address) || _first(fa.recommend),
        recommend: _first(fa.recommend),
        province: _first(rc.province),
        city: _first(rc.city),
        district: _first(rc.district),
        street: street,
        streetBase: _first(rc.street),
        adcode: _first((rs.ad_info || {}).adcode),
        pois: _poiList(rs.pois)
      };
    } catch (e) {
      return null;
    }
  }

  function _parseGeo(provider, d) {
    if (!d) return null;
    try {
      if (provider === 'amap') {
        var rg = d.regeocode || {};
        var ac = rg.addressComponent || {};
        var full = _first(rg.formatted_address);
        return {
          text: full,
          province: _first(ac.province),
          city: _first(ac.city) || _first(ac.province),
          district: _first(ac.district),
          street: _first(ac.township)
        };
      }
      if (provider === 'tencent') {
        return _parseTencentGeo(d);
      }
      var ad = d.address || {};
      return {
        text: _first(d.display_name),
        province: _first(ad.state) || _first(ad.region),
        city: _first(ad.city) || _first(ad.county) || _first(ad.state),
        district: _first(ad.county) || _first(ad.city_district) || _first(ad.suburb),
        street: _first(ad.road) || _first(ad.suburb)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 逆地理编码：经纬度 → 可读中文地址。
   * @param {number} lat 纬度
   * @param {number} lng 经度
   * @param {function} cb 回调（失败 / 超时一律给 null，绝不抛异常）
   */
  /**
   * 解析可用 provider 降级链：显式 provider 打头，按其配置的 key 决定是否可用，
   * 依次追加其余可用 provider，最后兜底 nominatim（免 Key）。有 key 就用，
   * 请求失败由调用方继续降级。
   * @param {String} lat
   * @param {String} lng
   * @returns {Array<String>}
   */
  function _providerChain() {
    var cfg = GEO || {};
    var pref = cfg.provider || 'nominatim';
    var order = [pref];
    var all = ['tencent', 'amap', 'nominatim'];
    var i;
    for (i = 0; i < all.length; i++) { if (all[i] !== pref) order.push(all[i]); }
    var out = [];
    for (i = 0; i < order.length; i++) {
      var p = order[i];
      if (p === 'tencent' && cfg.tencentKey) out.push('tencent');
      else if (p === 'amap' && cfg.amapKey) out.push('amap');
      else if (p === 'nominatim') out.push('nominatim');
    }
    if (!out.length) out.push('nominatim');
    return out;
  }

  /** 单次逆地理请求（按 provider 组 URL + JSONP）。 */
  function _reqGeo(provider, sKey, lat, lng, cb) {
    var cbName = '__xtGeoCb' + sKey + '_' + (_geoSeq++);
    var url = '';
    if (provider === 'amap') {
      url = 'https://restapi.amap.com/v3/geocode/regeo?output=JSON&extensions=base&key=' +
        encodeURIComponent(GEO.amapKey) + '&location=' + encodeURIComponent(lng + ',' + lat) +
        '&callback=' + cbName;
    } else if (provider === 'tencent') {
      url = 'https://apis.map.qq.com/ws/geocoder/v1/?key=' +
        encodeURIComponent(GEO.tencentKey) + '&location=' + encodeURIComponent(lat + ',' + lng) +
        '&get_poi=1&poi_options=page_size=20&output=jsonp&callback=' + cbName;
    } else {
      url = 'https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=18&accept-language=zh-CN' +
        '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng) + '&json_callback=' + cbName;
    }
    _jsonp(url, cbName, (GEO && GEO.timeoutMs) || 9000, function (raw) {
      cb(_parseGeo(provider, raw));
    });
  }

  /* ---------------- R100：后端 geo 代理（/api/geo/*） ----------------
   * 线上纯 HTTP 非安全上下文里浏览器 geolocation 恒拒，前端 JSONP 直连又受
   * Key 配额限制，故逆地理 / IP 定位 / 行政区划下级优先走后端代理（同源
   * fetch，无 CORS / 配额问题）；后端不可达或 ok:false 时降级回前端 JSONP
   * 链（R96 能力原样保留，GEO.tencentKey 仍作降级使用）。基址拼法与
   * admin-contact.js / ai-service.js 的既有模式完全一致：getApiBase() →
   * API_BASE → http(s) 同源相对路径 → file://（APK）直连服务器。
   * 坐标仅用于请求参数，绝不进入任何面向用户的字符串输出。 */
  function _apiBase() {
    try { if (typeof window.getApiBase === 'function') return window.getApiBase() || ''; } catch (e) { /* 忽略 */ }
    try { if (window.API_BASE != null) return window.API_BASE; } catch (e2) { /* 忽略 */ }
    try {
      if (location.protocol === 'http:' || location.protocol === 'https:') return '';
    } catch (e3) { /* 忽略 */ }
    return 'http://110.42.134.62:8000';
  }

  /** GET fetch JSON（带超时兜底）；任何失败一律回调 null，绝不抛异常。 */
  function _fetchJson(path, cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    if (typeof fetch !== 'function') { done(null); return; }
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      done(null);
    }, (GEO && GEO.timeoutMs) || 9000);
    function finish(v) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(v);
    }
    try {
      fetch(_apiBase() + path).then(function (r) {
        if (!r || !r.ok) { finish(null); return null; }
        return r.json();
      }).then(function (j) {
        finish(j || null);
      }).catch(function (e) {
        finish(null);
      });
    } catch (e2) {
      finish(null);
    }
  }

  /** 当前环境是否安全上下文（纯 HTTP 站点为 false，geolocation 按 Web 规范恒拒）。 */
  function _isSecure() {
    try { return window.isSecureContext === true; } catch (e) { return false; }
  }

  /**
   * IP 定位（后端 /api/geo/ip）：cb({ok,province,city,district,adcode,lat,lng,source})。
   * 失败（网络错 / ok:false）一律回调 null，绝不抛异常。
   */
  function ipLocate(cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    _fetchJson('/api/geo/ip', function (j) {
      if (!j || j.ok !== true) { done(null); return; }
      done(j);
    });
  }

  /**
   * 行政区划下级（后端 /api/geo/children）：cb(children 数组 [{id,name}])。
   * 部分区县腾讯无街道数据 → 空数组；失败（网络错 / ok:false）回调 null。
   * 绝不抛异常。
   */
  function children(adcode, cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    var code = String(adcode == null ? '' : adcode);
    code = code.replace(/[^0-9]/g, '');
    if (!code) { done(null); return; }
    _fetchJson('/api/geo/children?adcode=' + encodeURIComponent(code), function (j) {
      if (!j || j.ok !== true || !j.children) { done(null); return; }
      done(j.children);
    });
  }

  /** 后端 /api/geo/reverse 结果 → 与 _parseGeo 同形的对象（含街道与周边 POI）。 */
  function _parseProxyGeo(d) {
    if (!d || d.ok !== true) return null;
    try {
      var street = String(d.street || '');
      var num = String(d.street_number || '');
      var st = street && num ? (street + ' ' + num) : (street || num);
      var pois = [];
      if (Object.prototype.toString.call(d.pois) === '[object Array]') {
        for (var i = 0; i < d.pois.length && i < 10; i++) {
          var p = d.pois[i] || {};
          if (!p.title) continue;
          pois.push({
            title: String(p.title),
            address: p.address ? String(p.address) : '',
            category: '',
            distance: (p._distance == null || String(p._distance) === '') ? '' : String(p._distance),
            /* R104 项3b：保留后端代理 POI 经纬度（与 _poiList 同款 Number()+isFinite 校验）；
               后端未回传（字段缺失）→ null → 维持纯文字卡降级，绝不抛异常、绝不臆造坐标。 */
            lat: (p.lat != null && String(p.lat) !== '' && isFinite(Number(p.lat))) ? Number(p.lat) : null,
            lng: (p.lng != null && String(p.lng) !== '' && isFinite(Number(p.lng))) ? Number(p.lng) : null
          });
        }
      }
      return {
        text: String(d.address || ''),
        recommend: String(d.address || ''),
        province: String(d.province || ''),
        city: String(d.city || ''),
        district: String(d.district || ''),
        street: st,
        streetBase: street,
        adcode: String(d.adcode || ''),
        pois: pois,
        source: 'proxy'
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 逆地理编码（R100 双路）：优先后端代理 /api/geo/reverse（HTTP 线上环境
   * 的主路径，一次带回街道级地址 + 周边 POI ≤10 条）；失败（网络错 /
   * ok:false）降级前端 JSONP 链（腾讯 → amap → nominatim，R96 原路径）；
   * 全失败回调 null，由调用方降级手动选择。坐标 lat,lng 仅用于请求参数，
   * 绝不进入任何面向用户的字符串。
   * @param {number} lat 纬度
   * @param {number} lng 经度
   * @param {function} cb 回调（失败 / 超时一律给 null，绝不抛异常）
   */
  function reverseGeocode(lat, lng, cb) {
    var qs = '/api/geo/reverse?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng);
    _fetchJson(qs, function (j) {
      var g = _parseProxyGeo(j);
      if (g && g.text) { cb(g); return; }
      _reverseJsonp(lat, lng, cb);
    });
  }

  /** 前端 JSONP 链降级（R96 原路径，后端代理不可用 / ok:false 时兜底）。 */
  function _reverseJsonp(lat, lng, cb) {
    var chain = _providerChain();
    var idx = 0;
    var sKey = '' + (Date.now()) + '_' + (_geoSeq);
    function next() {
      if (idx >= chain.length) { cb(null); return; }
      var p = chain[idx++];
      _reqGeo(p, sKey, lat, lng, function (g) {
        if (g && g.text) { cb(g); return; }
        next();
      });
    }
    next();
  }

  /** R100：失败语义分流。非安全上下文（纯 HTTP）里 geolocation 恒拒，
   * 「denied / unsupported」并非用户真的拒绝或浏览器残缺，改走后端 IP 定位；
   * IP 也失败才按 reason='ip_fail' 回调（调用方给「当前网络环境无法自动定位」
   * 口径）。安全上下文下被拒维持「denied」原语义。settle 为 locate 的 once 闸门。 */
  function _failOver(settle, reason) {
    if ((reason === 'denied' || reason === 'unsupported') && !_isSecure()) {
      ipLocate(function (ip) {
        if (ip && ip.ok === true) {
          settle({
            ok: true,
            lat: (typeof ip.lat === 'number') ? ip.lat : null,
            lng: (typeof ip.lng === 'number') ? ip.lng : null,
            province: String(ip.province || ''),
            city: String(ip.city || ''),
            district: String(ip.district || ''),
            adcode: String(ip.adcode || ''),
            source: 'ip'
          });
          return;
        }
        settle({ ok: false, reason: 'ip_fail' });
      });
      return;
    }
    settle({ ok: false, reason: reason });
  }

  /**
   * 浏览器定位（失败不抛异常，统一走 err 回调）。
   * R100：非安全上下文（纯 HTTP）失败时自动降级后端 IP 定位——成功回调
   * {ok:true, lat, lng, province, city, district, adcode, source:'ip'}，
   * IP 也失败回调 {ok:false, reason:'ip_fail'}；坐标只走内部链路，
   * 绝不进入任何面向用户的字符串。
   */
  function locate(cb) {
    if (!navigator || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
      _failOver(cb, 'unsupported');
      return;
    }
    var settled = false;
    function once(res) {
      if (settled) return;
      settled = true;
      cb(res);
    }
    // 最多尝试 2 次（首次 + 自动重试 1 次）。手机首次定位常因 GPS 冷启动
    // 报 timeout(code 3)；重试放宽 timeout、调小 maximumAge 可显著提升成功率。
    // 权限被拒（code 1 / denied）不再重试，直接降级。
    var attempt = 0;
    var MAX_ATTEMPTS = 2;
    var timer = null;
    function doGet() {
      attempt++;
      var innerMs = (attempt === 1) ? 11000 : 15000;
      var maxAge = (attempt === 1) ? 30000 : 0;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { retryOrFail('timeout'); }, innerMs + 1000);
      try {
        navigator.geolocation.getCurrentPosition(function (pos) {
          if (timer) clearTimeout(timer);
          var c = (pos && pos.coords) || {};
          if (c.latitude == null || c.longitude == null) { retryOrFail('nopos'); return; }
          once({ ok: true, lat: c.latitude, lng: c.longitude });
        }, function (err) {
          if (timer) clearTimeout(timer);
          var code = err && err.code;
          if (code === 1) { _failOver(once, 'denied'); return; }
          retryOrFail(code === 2 ? 'unavailable' : (code === 3 ? 'timeout' : 'error'));
        }, { enableHighAccuracy: true, timeout: innerMs, maximumAge: maxAge });
      } catch (e) {
        if (timer) clearTimeout(timer);
        retryOrFail('error');
      }
    }
    function retryOrFail(reason) {
      if (settled) return;
      if (reason === 'denied') { _failOver(once, 'denied'); return; }
      if (attempt < MAX_ATTEMPTS) { doGet(); return; }
      once({ ok: false, reason: reason });
    }
    doGet();
  }

  /**
   * 周边 POI 查询：{title, address, category, distance}[]。
   * 主经 reverseGeocode（腾讯 get_poi=1 已带回 POI）；结果为空时用
   * 不额外打任何请求——腾讯「周边搜索」类接口（place/v1/search、
   * place/v1/explore）个人开发者额度仅 200 次/日，极易被打爆并连带
   * 影响其它功能，故一律不调用；失败一律给 []，绝不抛异常。
   * 距离一律保留腾讯原始值，绝不自行按经纬度计算。
   * @param {number} lat
   * @param {number} lng
   * @param {function} cb 回调 cb(list)，list 为数组（可能为空）
   */
  function nearby(lat, lng, cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    try {
      reverseGeocode(lat, lng, function (g) {
        /* 腾讯 get_poi=1 已在同一次请求里带回周边 POI，直接复用；
           无 POI 时给空数组，由调用方展示「附近位置」为空即隐藏该分组。
           【刻意不调 place/v1】理由见函数头注释：该接口额度仅 200/日。 */
        if (g && g.pois && g.pois.length) { done(g.pois); return; }
        done([]);
      });
    } catch (e2) {
      done([]);
    }
  }

  /** 折叠逆向结果为单一文本（text + recommend + street 去重合并，≤64 字符）。 */
  function _terseGeo(g) {
    if (!g) return '';
    var parts = [], seen = {}, i;
    var arr = [g.text, g.recommend, g.street];
    for (i = 0; i < arr.length; i++) {
      var v = (arr[i] == null) ? '' : String(arr[i]).replace(/^\s+|\s+$/g, '');
      if (!v || seen[v]) continue;
      seen[v] = 1;
      parts.push(v);
    }
    var s = parts.join(' ');
    if (s.length > 64) s = _safeCut(s, 63) + '…';
    return s;
  }

  window.XT_REGION = {
    DATA: DATA,
    GEO: GEO,
    provinces: provinces,
    citiesOf: citiesOf,
    districtsOf: districtsOf,
    textOf: textOf,
    search: search,
    parseText: parseText,
    reverseGeocode: reverseGeocode,
    locate: locate,
    nearby: nearby,
    ipLocate: ipLocate,
    children: children
  };

  /* ============================================================
   * R88-H：统一位置能力底座（XT_LOC_PICK）
   * ------------------------------------------------------------
   * 复用同文件的 XT_REGION.locate / reverseGeocode，实现
   * 「一键定位 → 逆地理编码 → 文字地址；任一环节失败降级手动输入」。
   *
   * 硬规则（设计 §3.1）：
   *   - text 是唯一允许进入任何字符串输出的字段；
   *   - lat / lng 禁止以任何形式拼接进任何 string。
   *   故本块内部【绝不出现把坐标转成字符串的表达式】。
   *
   * ES2017 上限：仅用 var + function，不用可选链 / 空值合并 / 对象展开 / 反引号模板 等。
   * ============================================================ */

  // 最近一次位置的 localStorage key
  var LAST_KEY = 'xt_loc_last';
  // text 字段最大长度（设计 §3.1：≤64 字符）
  var TEXT_MAX = 64;

  /** 安全取 localStorage 引用（隐私模式 / file:// 可能抛异常）。 */
  function _safeLS() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (e) {}
    return null;
  }

  /**
   * 安全截断：不切开代理对（surrogate pair），避免末尾出现孤立代理项渲染成乱码。
   * @param {String}  s 原串
   * @param {number}  n 期望长度上限
   * @returns {String}
   */
  function _safeCut(s, n) {
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    // 若末尾是高代理项（U+D800~U+DBFF），说明正好把一对字符切开了 -> 回退一位
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, n - 1);
    return cut;
  }

  /** 截断文本到 TEXT_MAX 字符（超长加省略号，不切开代理对）。 */
  function _clipText(s) {
    var t = (s == null) ? '' : String(s);
    if (t.length > TEXT_MAX) t = _safeCut(t, TEXT_MAX - 1) + '…';
    return t;
  }

  /** 写最近一次位置缓存（失败静默，不抛异常）。 */
  function _writeLast(loc) {
    var ls = _safeLS();
    if (!ls) return;
    try { ls.setItem(LAST_KEY, JSON.stringify(loc)); } catch (e) {}
  }

  /** 统一失败提示（文案一字不差，禁原生弹窗）。 */
  function _failToast() {
    try {
      if (typeof window !== 'undefined' && typeof window.XT_TOAST === 'function') {
        window.XT_TOAST('定位失败，请手动填写');
        return;
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && typeof window.toast === 'function') {
        window.toast('定位失败，请手动填写');
        return;
      }
    } catch (e2) {}
    // 无 toast 能力时静默（绝不 fallback 到 window.prompt / alert / confirm）
  }

  /**
   * 第 4 步：手动输入降级。
   * @param {Object}   opts
   * @param {Function} cb   cb(LocObj|null)
   */
  function _manual(opts, cb) {
    if (opts && typeof opts.onManual === 'function') {
      var title = (opts && opts.fallbackTitle) ? opts.fallbackTitle : '所在位置';
      try {
        opts.onManual(title, '如：图书馆 / 自习室', function (v) {
          var t = (v == null) ? '' : String(v);
          t = t.replace(/^\s+|\s+$/g, '');
          if (!t) { cb(null); return; }
          var loc = {
            text: _clipText(t),
            province: '',
            city: '',
            district: '',
            source: 'manual'
          };
          _writeLast(loc);
          cb(loc);
        });
      } catch (e) {
        cb(null);
      }
      return;
    }
    // 未注入 onManual：提示后放弃（绝不落坐标、绝不原生弹窗）
    _failToast();
    cb(null);
  }

  /**
   * 主入口：一键定位 → 逆地理编码 → 文字地址；任一环节失败降级手动输入。
   * @param {Object}   opts  { fallbackTitle?, allowManual?, lastKey?,
   *                           testLat?, testLng?, onManual? }
   *        testLat / testLng 为【测试钩子】：两者均为有限数时跳过
   *        navigator.geolocation，直接用给定坐标走 reverseGeocode（供 QA 在
   *        file:// 下证明「坐标 → 文字地址」链路）。生产路径永不传。
   * @param {Function} cb    回调 cb(LocObj|null)，null = 用户放弃 / 未设位置
   */
  function pick(opts, cb) {
    var o = opts || {};
    var done = (typeof cb === 'function') ? cb : function () {};

    // 第 3 / 4 步：拿到逆地理编码结果 g
    function finishGeo(r, g) {
      if (g && g.text) {
        var loc = {
          text: _clipText(g.text),
          province: g.province || '',
          city: g.city || '',
          district: g.district || '',
          lat: r.lat,
          lng: r.lng,
          source: 'gps'
        };
        _writeLast(loc);
        done(loc);
        return;
      }
      // 编码为空 → 第 4 步手动兜底
      _failToast();
      _manual(o, done);
    }

    // 第 2 步：逆地理编码
    function stepReverse(r) {
      reverseGeocode(r.lat, r.lng, function (g) {
        finishGeo(r, g);
      });
    }

    // 第 0 步：测试钩子优先（同时仅当两值均为有限数时生效）
    var hasTest = (typeof o.testLat === 'number' && isFinite(o.testLat) &&
                   typeof o.testLng === 'number' && isFinite(o.testLng));
    if (hasTest) {
      stepReverse({ ok: true, lat: o.testLat, lng: o.testLng });
      return;
    }

    // 第 1 步：浏览器定位
    locate(function (r) {
      if (!r || r.ok === false) {
        _failToast();
        _manual(o, done);
        return;
      }
      stepReverse(r);
    });
  }

  /**
   * 仅读缓存，不触发定位（供"一键复用上次位置"）。
   * @param {Function} cb cb(LocObj|null)
   */
  function last(cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    var ls = _safeLS();
    if (!ls) { done(null); return; }
    var raw = null;
    try { raw = ls.getItem(LAST_KEY); } catch (e) { raw = null; }
    if (!raw) { done(null); return; }
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e2) { obj = null; }
    if (!obj || !obj.text) { done(null); return; }
    done(obj);
  }

  /**
   * 判断一段文字是否为坐标明文（CI 断言用）。
   * @param {String} s
   * @returns {Boolean} 命中 /经纬度|\d+\.\d{3}\s*,/ 返回 true
   */
  function isCoordinateText(s) {
    if (s == null) return false;
    return /经纬度|\d+\.\d{3}\s*,/.test(String(s));
  }

  /* ---------------- R88-J：常用城市（LRU ≤8） ---------------- */
  var RECENT_KEY = 'xt_region_recent';
  var RECENT_MAX = 8;

  /**
   * 常用地址归一化键（pickfix 历史治理）：
   * ① 按空白/常见分隔符（· ， , 、 / |）拆段；② 段内再去空白；③ 去重复段
   * （同一条街道被拼接两次的串）；④ 段排序后拼接——使「广东省 广州市 天河区 文三路」
   * 「天河区 · 文三路 广州市 广东省」「广州市 天河区 文三路 文三路」等异拼法
   * 收敛为同一键（省+市+区+街道+POI 段集合等价即视为同一条）。
   * 仅用于历史去重比较，绝不参与任何展示文本输出。
   * @param {String} s 原始地址文本
   * @returns {String} 归一化键（空串 = 不可比较）
   */
  function _histKey(s) {
    var t = (s == null) ? '' : String(s);
    if (!t.replace(/\s+/g, '')) return '';
    var segs = t.split(/[\s·,，、/|]+/);
    var out = [], seen = {}, i;
    for (i = 0; i < segs.length; i++) {
      var v = String(segs[i]).replace(/\s+/g, '');
      if (!v || seen[v]) continue;
      seen[v] = 1;
      out.push(v);
    }
    out.sort();
    return out.join('|');
  }

  /** 读常用城市列表（读取时按归一键去重收敛存量数据；不改存储格式，失败返回 []）。 */
  function recentList() {
    var ls = _safeLS();
    if (!ls) return [];
    var raw = null;
    try { raw = ls.getItem(RECENT_KEY); } catch (e) { raw = null; }
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e2) { arr = null; }
    if (Object.prototype.toString.call(arr) !== '[object Array]') return [];
    var out = [], seenK = {}, i, s;
    for (i = 0; i < arr.length; i++) {
      s = (arr[i] == null) ? '' : String(arr[i]).replace(/^\s+|\s+$/g, '');
      if (!s) continue;
      var k = _histKey(s);
      if (!k || seenK[k]) continue;   // pickfix：归一键相同 → 只保留最新一条
      seenK[k] = 1;
      out.push(s);
    }
    return out;
  }

  /** 把一个地址文本推入常用地址（归一键去重 + LRU 置顶 + ≤8，失败静默）。 */
  function recentPush(text) {
    var t = (text == null) ? '' : String(text).replace(/^\s+|\s+$/g, '');
    if (!t) return;
    var key = _histKey(t);
    if (!key) return;
    var ls = _safeLS();
    if (!ls) return;
    var list = recentList();
    var out = [t], i;
    for (i = 0; i < list.length; i++) { if (_histKey(list[i]) !== key) out.push(list[i]); }
    if (out.length > RECENT_MAX) out = out.slice(0, RECENT_MAX);
    try { ls.setItem(RECENT_KEY, JSON.stringify(out)); } catch (e) {}
  }

  /* ---------------- R88-J：微信式位置选择组件（方案 A） ----------------
   * R130 起：地图区域升级为【Leaflet + 腾讯瓦片】真地图（可拖动/缩放，
   * 本地化 assets/leaflet/，懒加载，零 CDN 外链，技术路线见上方 R130 块）；
   * Leaflet 加载失败时静默退回纯 CSS 示意图（原渐变+伪元素道路保留作兜底）。
   * 中心 Pin 仍用 data-icon 风格的内联 SVG overlay。地址候选来自
   * XT_REGION.search() 省/市/区联想 + /api/geo/place POI 搜索 + 「用当前位置」
   * 的逆地理编码结果。rich 确认回传 {text, sub, lat, lng}（坐标不进字符串）。
   */
  var _pickSeq = 0;
  var PIN_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  var SEARCH_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#9aa3b2" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>';

  /* ============================================================
   * R130 位置选择真地图（Leaflet + 腾讯瓦片）
   * ------------------------------------------------------------
   * 技术路线（lead 定版，勿换）：Leaflet（本地化于 assets/leaflet/，
   * 1.9.4，随本组件按需懒加载）+ 腾讯栅格瓦片 rt{0-2}.map.gtimg.com/
   * realtimerender。不引腾讯 JS API v2（其域名白名单 Referer 校验会拒
   * file:// 与 APK WebView）、不用高德、零 CDN 外链。Key 复用本文件
   * GEO.tencentKey（瓦片 URL 附加参数 + 逆地理，不申请新 Key）。
   *
   * 坐标系说明：腾讯瓦片与腾讯 WebService 逆地理同为 GCJ-02，Leaflet
   * 视图坐标即 GCJ-02，二者自洽；rich 回调回传的 lat/lng 即视图坐标，
   * 消费方（地图卡 staticmap）同源一致。GPS（WGS-84）仅经既有 locate()
   * 链路进入，行为与 R100 一致，本组件不做坐标转换。
   *
   * 数据诚实红线：坐标仅用于本次发送（rich 回调 lat/lng 字段，绝不拼接
   * 进任何面向用户的字符串）；逆地理失败优雅降级为「所选位置」文案，
   * 不伪造 POI、不报错。
   * ============================================================ */

  // Leaflet 加载状态机：0 未加载 / 1 加载中 / 2 就绪 / 3 失败
  var _lfState = 0;
  var _lfWaiters = [];
  // 依据 xt-region.js 自身 <script src> 推导 assets/leaflet/ 基址，
  // 兼容根页面与子目录页面；推导失败回退 'assets/leaflet/'。
  var _lfDir = (function () {
    var fallback = 'assets/leaflet/';
    try {
      var cur = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript : null;
      if (cur && cur.src) return String(cur.src).replace(/xt-region\.js.*$/, '') + 'leaflet/';
      var ss = document.getElementsByTagName('script');
      for (var i = ss.length - 1; i >= 0; i--) {
        if (ss[i].src && /xt-region\.js/.test(ss[i].src)) {
          return String(ss[i].src).replace(/xt-region\.js.*$/, '') + 'leaflet/';
        }
      }
    } catch (e) {}
    return fallback;
  })();

  /** 【后续扩展点】地图就绪后挂载附加图层（如批5 实时共享层）。保留空实现，勿删。 */
  function _mapExtOnReady() { /* 预留：后续扩展在此 addLayer */ }
  /** 【后续扩展点】每次地图移动后附加行为（如节流上报中心点）。保留空实现，勿删。 */
  function _mapExtOnMove() { /* 预留：后续扩展在此读取 lmap.getCenter() */ }

  /**
   * 确保本地 Leaflet 已注入（CSS+JS 各一次，幂等）；就绪/失败后回调 ok(bool)。
   * 失败（文件缺失/超时）上层组件静默退回原 CSS 示意图，绝不报错。
   */
  function _ensureLeaflet(cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    if (_lfState === 2) { done(true); return; }
    if (_lfState === 3) { done(false); return; }
    _lfWaiters.push(done);
    if (_lfState === 1) return;
    _lfState = 1;
    var settled = false;
    function settle(ok) {
      if (settled) return;
      settled = true;
      _lfState = ok ? 2 : 3;
      var ws = _lfWaiters;
      _lfWaiters = [];
      for (var i = 0; i < ws.length; i++) { try { ws[i](ok); } catch (e) {} }
    }
    var timer = setTimeout(function () { settle(!!(window.L && window.L.map)); }, 8000);
    // CSS 只注入一次（幂等 id 保护）
    try {
      if (!document.getElementById('xt-leaflet-css')) {
        var link = document.createElement('link');
        link.id = 'xt-leaflet-css';
        link.rel = 'stylesheet';
        link.href = _lfDir + 'leaflet.css';
        (document.getElementsByTagName('head')[0] || document.documentElement).appendChild(link);
      }
    } catch (e1) {}
    // JS：已就位（同页其它组件先注入过）直接判定；否则注入本地 leaflet.js
    if (window.L && window.L.map) { try { clearTimeout(timer); } catch (e0) {} settle(true); return; }
    try {
      var s = document.createElement('script');
      s.charset = 'UTF-8';
      s.src = _lfDir + 'leaflet.js';
      s.onload = function () { try { clearTimeout(timer); } catch (e2) {} settle(!!(window.L && window.L.map)); };
      s.onerror = function () { try { clearTimeout(timer); } catch (e3) {} settle(false); };
      (document.getElementsByTagName('head')[0] || document.documentElement).appendChild(s);
    } catch (e4) {
      try { clearTimeout(timer); } catch (e5) {}
      settle(false);
    }
  }

  /**
   * 腾讯栅格瓦片图层：Leaflet URL 模板不支持 { -y}，按业界通用实现覆写
   * getTileUrl，把 Leaflet 自上而下的 y 翻转为腾讯自下而上的 y = 2^z - 1 - y；
   * 子域 rt0/rt1/rt2。瓦片加载失败时 Leaflet 显示空白格，上层不做任何
   * 错误提示（符合「不报错」红线）。
   */
  function _makeTencentTileLayer() {
    var Cls = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var z = (typeof this._getZoomForUrl === 'function') ? this._getZoomForUrl() : coords.z;
        var s = (typeof this._getSubdomain === 'function') ? this._getSubdomain(coords) : '0';
        var y = Math.pow(2, z) - 1 - coords.y;
        return 'https://rt' + s + '.map.gtimg.com/realtimerender?z=' + z +
          '&x=' + coords.x + '&y=' + y +
          '&type=vector&style=0&key=' + encodeURIComponent(GEO.tencentKey);
      }
    });
    // 注意：L.TileLayer 构造签名为 (url, options)，url 参数不可省——
    // 否则 options 会被当作 url，subdomains 等全部落回默认值（实测踩坑：出现 rta/rtb/rtc）。
    return new Cls('', { subdomains: '012', minZoom: 3, maxZoom: 18, maxNativeZoom: 18 });
  }

  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /**
   * 打开「选择位置」面板。
   * @param {Object}   opts { title?, confirmText?, current?, rich? }
   *        rich（R104 项3，默认 false）：为真时确认回调回传对象 {text, sub, lat, lng}；
   *        为假（默认）时【逐字保持】既有契约，只回传字符串文案或 null —— 保证
   *        xt-moments.js 及既有 QA 脚本零改动。
   * @param {Function} cb 回调 cb(textOrNull) 或（rich 时）cb({text,sub,lat,lng}|null)
   */
  function openPicker(opts, cb) {
    var o = opts || {};
    var done = (typeof cb === 'function') ? cb : function () {};
    var title = o.title || '选择位置';
    var confirmText = o.confirmText || '确认';
    var initText = (o.current == null) ? '' : String(o.current);

    var rootId = '__xtLocPicker' + (_pickSeq++);
    var root = document.createElement('div');
    root.id = rootId;
    root.className = 'xtlp';

    var STYLE =
      '.xtlp{position:fixed;inset:0;z-index:1200;background:#f5f7fb;overflow:hidden}'+
      '.xtlp-body{position:absolute;inset:0;display:flex;flex-direction:column}'+
      '.xtlp *{box-sizing:border-box}'+
      '.xtlp-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e6e9f0}'+
      '.xtlp-back{border:1px solid #e6e9f0;background:transparent;border-radius:10px;padding:6px 10px;font-size:13px;color:#6b7280;cursor:pointer}'+
      '.xtlp-title{font-size:16px;font-weight:700;color:#1f2937}'+
      '.xtlp-ok{margin-left:auto;border:none;border-radius:10px;padding:8px 16px;font-size:14px;font-weight:700;color:#fff;background:#5B8DEF;cursor:pointer}'+
      '.xtlp-ok[disabled]{opacity:.45;cursor:default}'+
      '.xtlp-search{flex:0 0 auto;display:flex;align-items:center;gap:8px;margin:10px 12px;padding:9px 12px;border-radius:12px;background:#fff;border:1px solid #e6e9f0}'+
      '.xtlp-search input{flex:1;border:none;outline:none;background:transparent;font-size:14px;color:#1f2937}'+
      /* R104c：显式搜索按钮 + 熔断/失败提示（仅 UI；固定值，禁 clamp/min/max） */
      '.xtlp-go{flex:0 0 auto;border:none;border-radius:9px;padding:7px 12px;font-size:13px;font-weight:700;color:#fff;background:#5B8DEF;cursor:pointer}'+
      '.xtlp-go:active{opacity:.85}'+
      '.xtlp-note{margin:8px 0 2px;padding:8px 12px;border-radius:10px;background:#FFF7E6;color:#B26B00;font-size:12px;line-height:1.4}'+
      /* R104 批2：「上次发送 · 一键再发」行（仅在有效坐标记录时渲染；固定值，禁 clamp/min/max） */
      '.xtlp-lastsend{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;border-top:1px solid #eef1f6;background:#F5F9FF}'+
      '.xtlp-lastsend:active{background:#EAF2FF}'+
      '.xtlp-ls-label{flex:0 0 auto;font-size:12px;color:#8a8f99}'+
      '.xtlp-ls-main{flex:1;min-width:0;display:flex;flex-direction:column}'+
      '.xtlp-ls-name{font-size:14px;color:#1f2937;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'+
      '.xtlp-ls-sub{font-size:12px;color:#9aa3b2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'+
      '.xtlp-ls-go{flex:0 0 auto;color:#5B8DEF;font-size:13px;font-weight:700}'+
      /* pickfix point6/7：地图高度写死 168px → 响应式（32vh，上限 420px，下限 168px）。
         vh 在 fixed 定位层安全；老 WebView 禁 clamp()/min()/max() 函数，但
         min-height/max-height 属性可用。列表区 flex:1 1 auto + overflow-y 滚动兜底。 */
      '.xtlp-map{flex:0 0 auto;position:relative;height:32vh;max-height:420px;min-height:168px;margin:0 12px;border-radius:14px;overflow:hidden;'+
        'background:linear-gradient(135deg,#dbe7f7,#eef4fb 55%,#e5f0e6);border:1px solid #e6e9f0}'+
      '.xtlp-map::before{content:"";position:absolute;left:-10%;top:38%;width:120%;height:10px;background:rgba(255,255,255,.75);'+
        'transform:rotate(-8deg);box-shadow:0 34px 0 rgba(255,255,255,.55),0 -30px 0 rgba(255,255,255,.4)}'+
      '.xtlp-map::after{content:"";position:absolute;left:30%;top:-10%;width:10px;height:120%;background:rgba(255,255,255,.55);'+
        'transform:rotate(12deg)}'+
      /* R130：真地图容器（Leaflet 注入 .xtlp-lmap），占满 .xtlp-map；
         .xtlp-map 的渐变+伪元素道路作为瓦片加载失败时的 CSS 示意图兜底保留 */
      '.xtlp-lmap{position:absolute;left:0;top:0;width:100%;height:100%;background:#e9edf3}'+
      /* Pin/curline 置顶（z-index 高于 Leaflet 内部 pane 最大值 800），
         pointer-events:none 不挡地图拖拽（微信式中心 Pin 交互） */
      '.xtlp-pin{position:absolute;left:50%;top:46%;transform:translate(-50%,-100%);width:40px;height:40px;border-radius:50%;'+
        'pointer-events:none;z-index:900;'+
        'background:#eb5757;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(235,87,87,.4)}'+
      '.xtlp-pin::after{content:"";position:absolute;left:50%;bottom:-6px;transform:translateX(-50%) rotate(45deg);width:14px;height:14px;'+
        'background:#eb5757;border-radius:2px}'+
      '.xtlp-pin svg{position:relative;z-index:1}'+
      /* pickfix：压地图的大黑块 → 更矮的半透明胶囊（圆角 + 左右留白，
         不遮地图中心 Pin 附近内容；文字仍为 curline 回显位） */
      '.xtlp-curline{position:absolute;left:16px;right:16px;bottom:8px;background:rgba(31,41,55,.55);color:#fff;border-radius:999px;'+
        'pointer-events:none;z-index:900;'+
        'padding:4px 14px;font-size:12px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      /* R90 item3: flex:1 1 0% -> 1 1 auto + min-height:180px 下限（矮屏下保证列表可用，靠自身 overflow-y 滚） */
      '.xtlp-list{flex:1 1 auto;min-height:182px;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px 12px 0;background:#fff;border-radius:14px;border:1px solid #e6e9f0}'+
      '.xtlp-sec{padding:10px 14px 4px;font-size:12px;font-weight:700;color:#9aa3b2;letter-spacing:.5px}'+
      /* pickfix 两行条目：主行（POI 名/最短可识别名）+ 副行（省 市 区 街道，小字灰），
         两行均 ellipsis（原长串整行平铺未截断问题修复） */
      '.xtlp-item{display:block;padding:10px 14px;font-size:14px;color:#1f2937;cursor:pointer;border-top:1px solid #eef1f6}'+
      '.xtlp-item:active{background:#f5f7fb}'+
      '.xtlp-item.on{color:#5B8DEF;font-weight:700}'+
      '.xtlp-row1{display:flex;align-items:center;gap:10px;min-width:0}'+
      '.xtlp-name{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'+
      '.xtlp-row2{font-size:12px;color:#9aa3b2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'+
      '.xtlp-item .xtlp-tick{margin-left:auto;color:#5B8DEF;flex:none}'+
      /* pickfix：列表首行快捷「📍 发送我的位置」（替代原底部按钮区，点击走 doMyLoc 原语义） */
      '.xtlp-quick{display:flex;align-items:center;gap:8px;padding:12px 14px;font-size:14px;font-weight:700;color:#5B8DEF;cursor:pointer;border-top:1px solid #eef1f6}'+
      '.xtlp-quick:active{background:#f5f7fb}'+
      /* pickfix：省份平铺折叠开关（列表最底部，默认收起） */
      '.xtlp-prov-toggle{padding:12px 14px;font-size:13px;font-weight:700;color:#5B8DEF;cursor:pointer;text-align:center;border-top:1px solid #eef1f6}'+
      '.xtlp-prov-toggle:active{background:#f5f7fb}'+
      '.xtlp-empty{padding:26px 14px;text-align:center;color:#9aa3b2;font-size:13px}'+
      /* R90 item3：矮屏（总高 ≤ 560px：480/400 都落进来）收紧固定高度块，
         避免 overhead(293px)+列表 foot 超出视口导致截断。全固定值 + @media，禁 clamp/min/max。 */
      '@media (max-height:560px){'+
        '.xtlp-head{padding:7px 10px}'+
        '.xtlp-search{margin:7px 12px;padding:6px 10px}'+
        '.xtlp-map{min-height:110px}'+   /* pickfix point6/7：矮屏下限收紧，height 仍走基础规则 32vh */
        '.xtlp-list{margin:7px 12px 0}'+
      '}'+
      /* pickfix：窄屏（≤768px）隐藏「搜索」按钮（回车 / 输入 debounce 联想已有；PC 保留按钮） */
      '@media (max-width:768px){'+
        '.xtlp-go{display:none}'+
      '}';

    var style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);

    var html = '';
    html += '<div class="xtlp-head"><button type="button" class="xtlp-back" data-act="cancel">取消</button>';
    html += '<span class="xtlp-title">' + _escAttr(title) + '</span>';
    html += '<button type="button" class="xtlp-ok" data-act="ok" disabled>' + _escAttr(confirmText) + '</button></div>';
    html += '<div class="xtlp-search">' + SEARCH_SVG +
      '<input type="text" class="xtlp-input" placeholder="搜索地址 / 省 / 市 / 区，如：天河、杭州" autocomplete="off">' +
      '<button type="button" class="xtlp-go" data-act="search">搜索</button></div>';
    /* R130：.xtlp-lmap 为 Leaflet 容器（tiles 覆盖后不可见 CSS 示意图道路）；
       .xtlp-pin 中心固定 overlay（微信式），.xtlp-curline 显示当前中心地址 */
    html += '<div class="xtlp-map"><div class="xtlp-lmap"></div><div class="xtlp-pin">' + PIN_SVG + '</div>' +
      '<div class="xtlp-curline">尚未选择位置</div></div>';
    html += '<div class="xtlp-list"></div>';
    /* pickfix：底部按钮区整体移除——底部「取消」与顶部重复；
       「用当前位置」/「发送我的精确位置」按钮移除，改为地址列表首项快捷行
       「📍 发送我的位置」（data-quickloc，点击即走原 act=myloc 语义 doMyLoc）。 */

    /* R89-B: \u4e0d\u518d\u5305\u4e00\u5c42\u65e0\u6837\u5f0f\u7684 .xtlp-body \u4e2d\u95f4 div\uff08\u4f1a\u6253\u65ad .xtlp \u7684 flex
       \u5e03\u5c40\uff0c\u5bfc\u81f4 .xtlp-list \u7684 flex/overflow-y \u5931\u6548\u3001\u5217\u8868\u65e0\u6cd5\u6eda\u52a8\uff09\uff1b\u76f4\u63a5\u628a\u5185\u5bb9\u88c5\u8fdb root\uff0c
       \u5e76\u7528 CSS \u91cc\u7684 .xtlp-body{position:absolute;inset:0;display:flex;flex-direction:column}
       \u4f5c\u4e3a\u5b9a\u4f4d\u4e0e\u5f39\u6027\u5bb9\u5668\u3002 */
    var body = document.createElement('div');
    body.className = 'xtlp-body';
    body.innerHTML = html;
    root.appendChild(body);
    document.body.appendChild(root);

    var inputEl = root.querySelector('.xtlp-input');
    var listEl = root.querySelector('.xtlp-list');
    var curlineEl = root.querySelector('.xtlp-curline');
    var okEl = root.querySelector('.xtlp-ok');
    var chosen = '';
    var kw = '';
    var closed = false;
    var curSub = '';        // R104 项3：当前选中项的副地址（「区 + 路」级，如「西湖区 · 文三路」）
    var curLat = null;      // R104 项3：当前选中项纬度（拿不到坐标 → null）
    var curLng = null;      // R104 项3：当前选中项经度
    var curPrecise = false; // R104d 批4：当前选中是否为「我的精确位置」（POI/文字选择路径恒 false）
    var nearbyResults = [];  // 最近一次定位得到的周边 POI
    var locBusy = false;     // 定位中：置位后不再启动第二次，防止并发重复请求
    var mylocBusy = false;   // R104d 批4：精确定位进行中（独立闸门，不与 locBusy 互锁）
    /* R104c：显式地点搜索（回车 / 点「搜索」）状态 —— 与「输入联想」两态分离。 */
    var placeActive = false;   // 显式搜索命中态（true 且 placePois 非空时渲染 POI 组）
    var placeLoading = false;  // 显式搜索进行中
    var placePois = null;      // 显式搜索命中的 POI 组 [{title,address,category,lat,lng}]
    var placeSeq = 0;          // 显式搜索请求序号（丢弃迟到响应）
    var placeNote = '';        // 熔断/失败提示（仅 UI，绝不 alert/confirm/prompt）
    var placeNoteTimer = null; // 提示自动消失计时器
    var placeKw = '';          // R130：最近一次显式搜索的关键词（供输入 debounce 判定是否重置）
    var geoCtx = null;         // 最近定位/逆地理上下文 {adcode,city,province,lat,lng}（供 place boundary）
    var provOpen = false;      // pickfix：省份平铺折叠开关（false=默认收起为一行）
    /* R130 真地图（Leaflet）状态 */
    var lmap = null;           // Leaflet 地图实例（初始化失败/未就绪 → null，退回 CSS 示意图）
    var lmapReady = false;     // 地图已初始化并绑定 moveend
    var revTimer = null;       // moveend → 逆地理防抖计时器
    var revSeq = 0;            // 逆地理请求序号（丢弃迟到响应）
    var skipNextRev = 0;       // setView 飞行触发的 moveend 计数（地址已知，不重复解析省配额）

    function setChosen(text, sub, coord) {
      chosen = (text == null) ? '' : String(text).replace(/^\s+|\s+$/g, '');
      curSub = (sub == null) ? '' : String(sub);
      if (coord && typeof coord.lat === 'number' && typeof coord.lng === 'number' &&
          isFinite(coord.lat) && isFinite(coord.lng)) {
        curLat = coord.lat; curLng = coord.lng;
      } else { curLat = null; curLng = null; }
      curPrecise = false;   // R104d 批4：列表/输入选择路径非精确位置
      if (chosen) {
        curlineEl.textContent = chosen;
        okEl.removeAttribute('disabled');
      } else {
        curlineEl.textContent = sub || '尚未选择位置';
        okEl.setAttribute('disabled', 'disabled');
      }
      var items = listEl.querySelectorAll('.xtlp-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-text') === chosen) items[i].className = 'xtlp-item on';
        else items[i].className = 'xtlp-item';
      }
    }

    /* ---------------- R130：真地图（Leaflet + 腾讯瓦片） ----------------
     * 中心固定 Pin 走既有 .xtlp-pin CSS overlay（微信式「中心点选」交互，
     * 地图动 Pin 不动），不用 L.marker。所有函数 try/catch 包住，任何
     * Leaflet 异常都静默退回纯 CSS 示意图，绝不抛异常、绝不报错。 */

    /** 默认视图：优先上次发送坐标 → 本次定位上下文 → 北京（GCJ-02，与瓦片自洽）。 */
    function _mapDefaultView() {
      try {
        var rec = lastSendRead();
        if (rec && typeof rec.lat === 'number' && typeof rec.lng === 'number') {
          return { lat: rec.lat, lng: rec.lng, zoom: 16 };
        }
        if (geoCtx && typeof geoCtx.lat === 'number' && typeof geoCtx.lng === 'number') {
          return { lat: geoCtx.lat, lng: geoCtx.lng, zoom: 16 };
        }
      } catch (e0) {}
      return { lat: 39.90923, lng: 116.397428, zoom: 12 };
    }

    /** moveend → 逆地理防抖：停稳 500ms 才发（省配额，连续拖动只解析终点）。 */
    function _scheduleReverse() {
      if (revTimer) { try { clearTimeout(revTimer); } catch (e) {} revTimer = null; }
      revTimer = setTimeout(function () {
        revTimer = null;
        if (closed || !lmapReady || !lmap) return;
        var c = null;
        try { c = lmap.getCenter(); } catch (e1) { c = null; }
        if (!c || !isFinite(c.lat) || !isFinite(c.lng)) return;
        _revCenter(c.lat, c.lng);
      }, 500);
    }

    /** 中心点逆地理：成功回填 text/sub/坐标（rich 契约字段）；失败降级「所选位置」。 */
    function _revCenter(lat, lng) {
      var seq = ++revSeq;
      try { curlineEl.textContent = '正在解析所选位置…'; } catch (e0) {}
      reverseGeocode(lat, lng, function (g) {
        if (closed || seq !== revSeq) return;   // 迟到响应丢弃
        var txt = '';
        var sub = '';
        if (g && (g.text || g.recommend)) {
          txt = _terseGeo(g) || g.text || g.recommend;
          if (g.district) sub = g.district;
          if (g.streetBase) sub = sub ? (sub + ' · ' + g.streetBase) : g.streetBase;
        }
        if (!txt) {
          var RR = window.XT_REGION;
          if (g && (g.province || g.city) && RR && typeof RR.textOf === 'function') {
            txt = RR.textOf(g.province, g.city, g.district);
          }
        }
        if (!txt) txt = '所选位置';   // 优雅降级：不伪造 POI、不报错、坐标不进字符串
        setChosen(_clipText(txt), sub, { lat: lat, lng: lng });
        renderList();
      });
    }

    /** 列表点选带坐标时飞行定位（地址已知 → skipNextRev 抑制重复逆地理）。 */
    function _flyTo(lat, lng) {
      if (!lmapReady || !lmap) return;
      skipNextRev = skipNextRev + 1;
      try {
        var z = lmap.getZoom();
        lmap.setView([lat, lng], (z > 16) ? z : 16, { animate: true });
      } catch (e) {
        skipNextRev = 0;
      }
    }

    /** 初始化地图：腾讯瓦片 + moveend 绑定；失败静默（保留 CSS 示意图）。 */
    function _initMap() {
      if (lmapReady || closed) return;
      var el = root.querySelector('.xtlp-lmap');
      if (!el || !window.L || !window.L.map) return;
      try {
        lmap = L.map(el, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
          doubleClickZoom: true
        });
        lmap.addLayer(_makeTencentTileLayer());
        var dv = _mapDefaultView();
        if (initText) skipNextRev = 1;   // 已带初始选择时抑制首帧自动逆地理（不覆盖 current）
        lmap.setView([dv.lat, dv.lng], dv.zoom, { animate: false });
        lmap.on('moveend', function () {
          if (skipNextRev > 0) { skipNextRev = skipNextRev - 1; _mapExtOnMove(); return; }
          _mapExtOnMove();
          _scheduleReverse();
        });
        lmapReady = true;
        _mapExtOnReady();
      } catch (e2) {
        lmap = null;
        lmapReady = false;   // 静默退回 CSS 示意图
      }
    }

    /**
     * 两行拆分（pickfix）：主行取最具体一段（最后一段：POI 名/街道/区），
     * 副行为其余前缀（省 市 区…）。单段或无空白 → 主行原文、无副行。
     * 仅拆展示用，不改 data-text（选中态高亮与回调仍用完整原文）。
     */
    function _splitAddr(text) {
      var t = (text == null) ? '' : String(text);
      var segs = t.split(/\s+/);
      var clean = [], i;
      for (i = 0; i < segs.length; i++) { if (segs[i]) clean.push(segs[i]); }
      if (clean.length <= 1) return { main: t, sub: '' };
      return { main: clean[clean.length - 1], sub: clean.slice(0, clean.length - 1).join(' ') };
    }

    function itemRow(text, sub, lat, lng) {
      var cls = 'xtlp-item' + (text === chosen ? ' on' : '');
      var coordAttr = '';
      if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
        coordAttr = ' data-lat="' + _escAttr(lat) + '" data-lng="' + _escAttr(lng) + '"';
      }
      /* pickfix 两行渲染：显式 sub（POI 地址）→ 主行整段标题；否则按段拆分（主行=最具体段） */
      var hasSub = (sub != null && String(sub) !== '');
      var main = hasSub ? String(text) : _splitAddr(text).main;
      var subLine = hasSub ? String(sub) : _splitAddr(text).sub;
      return '<div class="' + cls + '" data-text="' + _escAttr(text) + '"' + coordAttr + '>' +
        '<div class="xtlp-row1"><span class="xtlp-name">' + _escAttr(main) + '</span>' +
        (text === chosen ? '<span class="xtlp-tick">✓</span>' : '') + '</div>' +
        (subLine ? '<div class="xtlp-row2">' + _escAttr(subLine) + '</div>' : '') +
        '</div>';
    }

    function renderList() {
      var html2 = '';
      var i, R;
      // R104c：熔断/失败提示（仅 UI）
      var noteHtml = placeNote ? '<div class="xtlp-note">' + _escAttr(placeNote) + '</div>' : '';
      // R104 批2：列表顶部「上次发送 · 一键再发」（无有效坐标记录 → 空串）
      var leadHtml = lastSendHtml() + noteHtml;
      // R104c：显式搜索进行中
      if (placeLoading) { listEl.innerHTML = leadHtml + '<div class="xtlp-empty">正在搜索…</div>'; return; }
      // R104c：显式搜索命中 → POI 组（每条走 itemRow(title,address,lat,lng) → data-lat/lng）
      if (placeActive && placePois && placePois.length) {
        html2 += leadHtml;
        html2 += '<div class="xtlp-sec">地点</div>';
        for (i = 0; i < placePois.length; i++) {
          var pp = placePois[i] || {};
          var plSub = pp.address || pp.category || '';
          html2 += itemRow(pp.title, plSub, pp.lat, pp.lng);
        }
        listEl.innerHTML = html2;
        return;
      }
      // —— 以下为既有本地联想（输入 debounce / 显式搜索回退共用）——
      if (kw) {
        R = window.XT_REGION;
        var hits = (R && typeof R.search === 'function') ? R.search(kw, 40) : [];
        if (!hits.length) { listEl.innerHTML = leadHtml + '<div class="xtlp-empty">没找到「' + _escAttr(kw) + '」，换个关键词试试</div>'; return; }
        html2 += leadHtml;
        html2 += '<div class="xtlp-sec">搜索结果</div>';
        for (i = 0; i < hits.length; i++) {
          /* pickfix：不传 sub，走 _splitAddr 两行拆分（主行=最具体段，副行=省 市…） */
          html2 += itemRow(hits[i].text, '');
        }
        listEl.innerHTML = html2;
        return;
      }
      /* pickfix：快捷行「📍 发送我的位置」为地址列表第一项（替代原底部按钮区） */
      html2 += '<div class="xtlp-quick" data-quickloc="1">📍 发送我的位置</div>';
      html2 += leadHtml;
      if (nearbyResults.length) {
        html2 += '<div class="xtlp-sec">附近位置</div>';
        for (i = 0; i < nearbyResults.length; i++) {
          var poi = nearbyResults[i] || {};
          var psub = poi.address || poi.category || '';
          html2 += itemRow(poi.title, psub, poi.lat, poi.lng);
        }
      }
      var recent = recentList();   // pickfix：读取时已按归一键去重（渲染层收敛存量数据）
      if (recent.length) {
        html2 += '<div class="xtlp-sec">常用城市</div>';
        for (i = 0; i < recent.length; i++) html2 += itemRow(recent[i], '');   // pickfix：「常用」角标全量删除
      }
      R = window.XT_REGION;
      var provs = (R && typeof R.provinces === 'function') ? R.provinces() : [];
      if (provs.length) {
        /* pickfix：省份平铺默认折叠为一行，放列表最底部；点开才展开原平铺 */
        if (provOpen) {
          html2 += '<div class="xtlp-sec">热门 / 全部省份</div>';
          for (i = 0; i < provs.length && i < 12; i++) html2 += itemRow(provs[i], '');
          html2 += '<div class="xtlp-prov-toggle" data-prov="1">收起省份 ▴</div>';
        } else {
          html2 += '<div class="xtlp-prov-toggle" data-prov="1">选择省份 ▾</div>';
        }
      }
      if (!html2) html2 = '<div class="xtlp-empty">暂无可选地址</div>';
      listEl.innerHTML = html2;
    }

    /* R104c：显式地点搜索（回车 / 点「搜索」触发；输入联想绝不触发）。
       关键词 strip() 后 < 2 字符不发请求（省腾讯 place 配额）；6s 超时；
       任何失败/空/熔断 → 回退本地省市区联想（不空白、不报错、不破版）。 */
    var PLACE_MIN = 2;         // 关键词最小长度（hard guard）
    var PLACE_TIMEOUT = 6000;  // 显式搜索超时（ms）

    /** 计算 place 的 boundary：优先 adcode → city → 设备坐标；均无则不传。 */
    function _placeBoundary() {
      var b = {};
      var adcode = (geoCtx && geoCtx.adcode) ? String(geoCtx.adcode) : '';
      if (adcode) { b.adcode = adcode; return b; }
      var pt = null;
      try { pt = parseText(chosen || initText); } catch (e) { pt = null; }
      var city = (pt && pt.city) ? pt.city : ((geoCtx && geoCtx.city) ? geoCtx.city : '');
      if (city) { b.city = city; return b; }
      if (geoCtx && typeof geoCtx.lat === 'number' && typeof geoCtx.lng === 'number') { b.lat = geoCtx.lat; b.lng = geoCtx.lng; return b; }
      /* R130：兜底用地图中心坐标——后端 /api/geo/place 要求 adcode/city/lat&lng
         至少其一（实测：全空 → bad_params）；无任何上下文时「地图当前中心」
         即用户所在区域的最近似语义。 */
      if (lmapReady && lmap) {
        try {
          var c = lmap.getCenter();
          if (c && isFinite(c.lat) && isFinite(c.lng)) { b.lat = c.lat; b.lng = c.lng; }
        } catch (e2) {}
      }
      return b;
    }

    /** GET {apiBase}/api/geo/place?keyword=&adcode|city|lat&lng；失败/超时一律 cb(null)，绝不抛异常。 */
    function _placeSearch(keyword, boundary, cb) {
      var doneCb = (typeof cb === 'function') ? cb : function () {};
      if (typeof fetch !== 'function') { doneCb(null); return; }
      var b = boundary || {};
      var qs = '/api/geo/place?keyword=' + encodeURIComponent(keyword);
      if (b.adcode) qs += '&adcode=' + encodeURIComponent(b.adcode);
      else if (b.city) qs += '&city=' + encodeURIComponent(b.city);
      else if (typeof b.lat === 'number' && typeof b.lng === 'number') qs += '&lat=' + encodeURIComponent(b.lat) + '&lng=' + encodeURIComponent(b.lng);
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; doneCb(null); } }, PLACE_TIMEOUT);
      function settle(v) { if (settled) return; settled = true; try { clearTimeout(timer); } catch (e0) {} doneCb(v); }
      try {
        fetch(_apiBase() + qs).then(function (r) {
          if (!r || !r.ok) { settle(null); return null; }
          return r.json();
        }).then(function (j) {
          settle((j && typeof j === 'object') ? j : null);
        }).catch(function () { settle(null); });
      } catch (e2) { settle(null); }
    }

    /** 熔断/失败提示（仅 UI，自动 4s 消失）。 */
    function _placeNote(msg) {
      placeNote = msg ? String(msg) : '';
      if (placeNoteTimer) { try { clearTimeout(placeNoteTimer); } catch (e) {} placeNoteTimer = null; }
      if (placeNote) {
        placeNoteTimer = setTimeout(function () {
          placeNoteTimer = null;
          if (closed) return;
          placeNote = '';
          renderList();
        }, 4000);
      }
    }

    /** 显式搜索入口（回车 / 点「搜索」，立即请求，不等 debounce）。 */
    function doPlaceSearch() {
      var q = String(inputEl.value || '').replace(/^\s+|\s+$/g, '');
      kw = q;
      placeKw = q;   // R130：记录本次显式搜索关键词（debounce 据此判定是否重置）
      if (q.length < PLACE_MIN) {   // 不足 2 字符：不发请求，回退本地联想
        placeActive = false; placeLoading = false; placePois = null;
        renderList();
        return;
      }
      _placeNote('');
      placeActive = true; placeLoading = true; placePois = null;
      renderList();
      var seq = ++placeSeq;
      _placeSearch(q, _placeBoundary(), function (res) {
        if (closed || seq !== placeSeq) return;   // 迟到 / 被新请求取代 → 丢弃
        placeLoading = false;
        if (res && res.pois && res.pois.length) {
          placePois = res.pois;
          placeActive = true;
        } else {
          // 失败 / 超时 / 空结果 / 熔断 → 回退本地省市区联想
          placePois = null;
          placeActive = false;
          if (res && res.degraded === true) _placeNote('搜索能力今日已达上限');
        }
        renderList();
      });
    }

    /* R104d 批4 + pickfix：发送我的精确位置 —— 一次性现场 GPS（原生桥优先，
       桥退化为 watchPosition 一次 fix），拿到真坐标即 finish 发送（precise:true，
       跳过 reverseGeocode、跳过列表、跳过二次点选）；失败绝不发送，toast + 分档提示仅 UI。
       严禁走 locate()：纯 HTTP 下它经 _failOver 静默降级成 IP 定位（source:'ip'），
       会把城市级粗坐标冒充「精确位置」发出。 */
    var MYLOC_MSG_ENV = '当前网页环境不支持精确定位，请在 App 内发送，或手动选择地点';
    var MYLOC_MSG_DENIED = '未授权定位，请在浏览器允许位置权限后重试';

    /** 安全上下文判定：isSecureContext 优先，缺失时按 https 协议兜底（http/file 均视为非安全）。 */
    function _isSecureCtx() {
      try {
        if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
      } catch (e0) {}
      try {
        var p = (window.location && window.location.protocol) ? String(window.location.protocol) : '';
        return p === 'https:';
      } catch (e1) { return false; }
    }

    /** 原生桥（与 chat-local.js imLiveBridge 同源约定）：XTAppBridge / StudyAndroid。 */
    function _natBridge() {
      var b = null;
      try { b = window.XTAppBridge || window.StudyAndroid || null; } catch (e0) { b = null; }
      return b;
    }

    /** 一次性定位是否可用：桥有一发式定位，或安全上下文 + geolocation。 */
    function _oneShotAvail() {
      var br = _natBridge();
      if (br && typeof br.getCurrentLocation === 'function') return true;
      var geo = null;
      try { geo = navigator.geolocation; } catch (e1) { geo = null; }
      return !!(geo && typeof geo.watchPosition === 'function') && _isSecureCtx();
    }

    /**
     * 一次性现场定位（pickfix：桥优先 → watchPosition 一次 fix 降级）。
     * 桥契约（前向兼容）：br.getCurrentLocation(cb)，cb 收 JSON 串 {lat,lng}；
     * 现网桥暂无该方法，探测到才启用，绝不调用未定义方法。
     * JS 降级：watchPosition 拿到首个有效 fix 即 clearWatch；12s 超时兜底。
     * 回调 cb({ok:true,lat,lng}) / cb({ok:false,reason})；
     * reason ∈ unsupported / insecure / denied / timeout / gps_fail / bridge_fail。
     * 绝不 IP 兜底（粗坐标不得冒充精确位置）、绝不抛异常。
     */
    function _oneShotFix(cb) {
      var done = (typeof cb === 'function') ? cb : function () {};
      var settled = false;
      var geo = null;
      var watchId = null;
      var timer = null;
      function cleanup() {
        if (watchId != null && geo && typeof geo.clearWatch === 'function') {
          try { geo.clearWatch(watchId); } catch (e0) {}
          watchId = null;
        }
        if (timer) { try { clearTimeout(timer); } catch (e1) {} timer = null; }
      }
      function finishOne(r) {
        if (settled) return;
        settled = true;
        cleanup();
        done(r);
      }
      /* ① 原生桥一发式定位（前向兼容；现网桥未提供即跳过） */
      var br = _natBridge();
      if (br && typeof br.getCurrentLocation === 'function') {
        try {
          br.getCurrentLocation(function (jsonStr) {
            var o = null;
            try { o = JSON.parse(String(jsonStr == null ? '' : jsonStr)); } catch (e2) { o = null; }
            var la = o ? Number(o.lat) : NaN;
            var ln = o ? Number(o.lng) : NaN;
            if (isFinite(la) && isFinite(ln)) finishOne({ ok: true, lat: la, lng: ln });
            else finishOne({ ok: false, reason: 'bridge_fail' });
          });
          return;
        } catch (e3) { /* 桥异常 → 落 watchPosition */ }
      }
      /* ② watchPosition 一次 fix */
      try { geo = navigator.geolocation; } catch (e4) { geo = null; }
      if (!geo || typeof geo.watchPosition !== 'function') { finishOne({ ok: false, reason: 'unsupported' }); return; }
      if (!_isSecureCtx()) { finishOne({ ok: false, reason: 'insecure' }); return; }
      timer = setTimeout(function () { finishOne({ ok: false, reason: 'timeout' }); }, 12000);
      try {
        watchId = geo.watchPosition(function (pos) {
          var c = (pos && pos.coords) ? pos.coords : null;
          var la = c ? Number(c.latitude) : NaN;
          var ln = c ? Number(c.longitude) : NaN;
          if (!isFinite(la) || !isFinite(ln)) return;   // 无效 fix：等下一次
          finishOne({ ok: true, lat: la, lng: ln });
        }, function (err) {
          var code = err && err.code;
          finishOne({ ok: false, reason: (code === 1) ? 'denied' : 'gps_fail' });
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
      } catch (e5) {
        finishOne({ ok: false, reason: 'gps_fail' });
      }
    }

    function doMyLoc() {
      if (mylocBusy) return;   // 独立 busy 闸门（不与 locBusy 互锁）
      if (!_oneShotAvail()) {
        _placeNote(MYLOC_MSG_ENV);   // 非安全上下文 / 无 API：绝不 IP 兜底、绝不发送
        _failToast();
        renderList();
        return;
      }
      mylocBusy = true;
      setChosen('', '正在精确定位…');
      renderList();
      _oneShotFix(function (r) {
        if (closed) return;
        mylocBusy = false;
        if (!r || r.ok !== true || !isFinite(r.lat) || !isFinite(r.lng)) {
          setChosen('', '');
          var reason = (r && r.reason) || '';
          _placeNote(reason === 'denied' ? MYLOC_MSG_DENIED : MYLOC_MSG_ENV);
          _failToast();   // pickfix：取不到定位 → toast 提示且不发送
          renderList();
          return;
        }
        // 拿到真坐标即发送：跳过 reverseGeocode、跳过列表、跳过二次点选。
        setChosen('我的位置', '', { lat: r.lat, lng: r.lng });
        curPrecise = true;
        finish(chosen);
      });
    }

    /* R104 批2：上次发送位置（一键再发）—— 读写 xt_loc_last（与 pick() 同键；失败静默）。 */
    /** 读上次发送记录；无 / 坏 JSON / 非对象 / 缺 text / 坐标非法 → null（该行不渲染）。 */
    function lastSendRead() {
      var ls = _safeLS();
      if (!ls) return null;
      var raw = null;
      try { raw = ls.getItem(LAST_KEY); } catch (e) { return null; }
      if (!raw) return null;
      var o = null;
      try { o = JSON.parse(raw); } catch (e2) { return null; }
      if (!o || typeof o !== 'object') return null;
      var t = (o.text == null) ? '' : String(o.text);
      if (!t) return null;
      var la = Number(o.lat), ln = Number(o.lng);
      if (!(o.lat != null && String(o.lat) !== '' && isFinite(la) &&
            o.lng != null && String(o.lng) !== '' && isFinite(ln))) return null;
      return { text: t, sub: (o.sub == null ? '' : String(o.sub)), lat: la, lng: ln,
               precise: o.precise === true };   // R104d 批4：last 记录带 precise（缺失 → false）
    }

    /** 写上次发送记录 {text,sub,lat,lng}；try/catch 包住，失败不影响发送。 */
    function lastSendWrite(text) {
      var ls = _safeLS();
      if (!ls) return;
      try {
        ls.setItem(LAST_KEY, JSON.stringify({
          text: chosen || String(text || ''),
          sub: curSub || '',
          lat: (typeof curLat === 'number' ? curLat : null),
          lng: (typeof curLng === 'number' ? curLng : null),
          precise: curPrecise === true   // R104d 批4：last 记录带 precise（一键再发不退化）
        }));
      } catch (e) { /* localStorage 禁用 / 写满：静默，不影响发送 */ }
    }

    /** 列表顶部「上次发送：XXX · 一键再发」行 HTML（无有效记录 → 空串）。 */
    function lastSendHtml() {
      var rec = lastSendRead();
      if (!rec) return '';
      var sub = rec.sub ? '<span class="xtlp-ls-sub">' + _escAttr(rec.sub) + '</span>' : '';
      return '<div class="xtlp-lastsend" data-lastsend="1">' +
        '<span class="xtlp-ls-label">上次发送：</span>' +
        '<span class="xtlp-ls-main"><span class="xtlp-ls-name">' + _escAttr(rec.text) + '</span>' + sub + '</span>' +
        '<span class="xtlp-ls-go">一键再发</span>' +
      '</div>';
    }

    /** 点「一键再发」：直接用上次记录走 finish（等价重选并确认），不重复写 xt_loc_last。 */
    function lastSendReuse() {
      var rec = lastSendRead();
      if (!rec) return;
      chosen = rec.text;
      curSub = rec.sub || '';
      curLat = rec.lat;
      curLng = rec.lng;
      curPrecise = rec.precise === true;   // R104d 批4：一键再发保持「精确」语义
      finish(rec.text, true);
    }

    function finish(text, skipPersist) {
      if (closed) return;
      closed = true;
      /* R130：清理地图与防抖定时器（先于移除 DOM，避免 Leaflet 监听残留） */
      if (revTimer) { try { clearTimeout(revTimer); } catch (e5) {} revTimer = null; }
      try { if (lmap) { lmap.remove(); lmap = null; } } catch (e6) {}
      lmapReady = false;
      if (placeNoteTimer) { try { clearTimeout(placeNoteTimer); } catch (e) {} placeNoteTimer = null; }
      try { if (root.parentNode) root.parentNode.removeChild(root); } catch (e) {}
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (text) {
        // R104d 批4（lead 裁决）：精确位置不入 recent —— 「我的位置」是无坐标文本项，
        // 混进最近/常用后点选无法解析出坐标（违反「无坐标不产生坏数据」规范）；
        // 同时覆盖 myloc 成功与精确记录一键再发两条路径。lastSend 写入保留。
        if (curPrecise !== true) recentPush(text);
        if (!skipPersist) lastSendWrite(text);   // R104 批2：记录「上次发送」（一键再发时跳过）
      }
      if (o.rich) {
        // R104 项3：rich 模式回传结构化对象；无坐标时 lat/lng 回 null（前端退化为纯文字卡）。
        if (text) {
          done({ text: chosen || String(text), sub: curSub || '', lat: curLat, lng: curLng,
                 precise: curPrecise === true });   // R104d 批4：precise 随 rich 回调透传
        } else {
          done(null);
        }
        return;
      }
      done(text || null);
    }

    function onKey(e) {
      var k = e && e.key;
      if (k === 'Escape' || k === 'Esc') finish(null);
    }

    var kwTimer = null;
    inputEl.addEventListener('input', function () {
      if (kwTimer) clearTimeout(kwTimer);
      kwTimer = setTimeout(function () {
        kw = String(inputEl.value || '').replace(/^\s+|\s+$/g, '');
        // R104c：输入联想（≥800ms debounce）只走本地省市区联想，绝不触发 place 请求（省配额硬保护）。
        // R130 竞态修复：显式搜索进行中/已命中时，若关键词未变则不重置 place 状态——
        // 否则「输入后 800ms 内点搜索」场景下，迟到的 debounce 会把已渲染的 POI 结果冲成空列表。
        if (kw === placeKw && (placeLoading || (placeActive && placePois && placePois.length))) return;
        placeActive = false; placeLoading = false; placePois = null;
        renderList();
      }, 800);
    });

    // R104c：显式触发 —— 回车立即请求 place（不等 debounce）
    inputEl.addEventListener('keydown', function (e) {
      var k = e && e.key;
      if (k === 'Enter' || k === 'NumpadEnter') {
        if (e && e.preventDefault) e.preventDefault();
        doPlaceSearch();
      }
    });

    listEl.addEventListener('click', function (ev) {
      var node = ev.target;
      while (node && node !== listEl && !(node.getAttribute && (node.getAttribute('data-text') !== null || node.getAttribute('data-lastsend') !== null || node.getAttribute('data-quickloc') !== null || node.getAttribute('data-prov') !== null))) { node = node.parentNode; }
      if (!node || node === listEl) return;
      if (node.getAttribute('data-lastsend') !== null) { lastSendReuse(); return; }   // R104 批2：一键再发
      if (node.getAttribute('data-quickloc') !== null) { doMyLoc(); return; }         // pickfix：快捷行「📍 发送我的位置」
      if (node.getAttribute('data-prov') !== null) { provOpen = !provOpen; renderList(); return; }   // pickfix：省份折叠开关
      var t = node.getAttribute('data-text');
      if (t == null) return;
      // R104 项3：列表项若带经纬度（如附近 POI），选中时一并记录，供 rich 模式回传。
      var dla = node.getAttribute('data-lat'), dln = node.getAttribute('data-lng');
      var coord = null;
      if (dla != null && dln != null) {
        var nla = Number(dla), nln = Number(dln);
        if (isFinite(nla) && isFinite(nln)) coord = { lat: nla, lng: nln };
      }
      setChosen(t, '', coord);
      if (coord) _flyTo(coord.lat, coord.lng);   // R130：点选 POI 后地图飞到该点
    });

    root.addEventListener('click', function (ev) {
      var n = ev.target;
      while (n && n !== root && !(n.getAttribute && n.getAttribute('data-act'))) { n = n.parentNode; }
      if (!n || n === root) return;
      var act = n.getAttribute('data-act');
      if (act === 'cancel') { finish(null); return; }
      if (act === 'ok') { if (chosen) finish(chosen); return; }
      if (act === 'search') { doPlaceSearch(); return; }   // R104c：显式地点搜索
      if (act === 'myloc') { doMyLoc(); return; }          // R104d 批4：发送我的精确位置（pickfix 起由列表快捷行触发）
      /* pickfix：act='loc'（原「用当前位置」按钮）随底部按钮区一并移除，
         自动预选能力由 _autoLocate（进页触发）承接。 */
    });

    /* R89-B\uff1a\u7a97\u53e3\u5c3a\u5bf8\u53d8\u5316\uff08\u65cb\u5c4f / \u8f6f\u952e\u76d8\uff09\u65f6\u91cd\u7b97\u5217\u8868\u9ad8\u5ea6\u4e0a\u9650\u3002 */
    function onResize() {
      if (closed || !listEl) return;
      try { if (lmap) lmap.invalidateSize(); } catch (e0) {}   // R130：地图容器尺寸变化重算
      var h = 0;
      try { h = window.innerHeight || 0; } catch (e) { h = 0; }
      if (h && h >= 120) {
        var maxH = h - 300;
        if (maxH < 120) maxH = 120;
        listEl.style.maxHeight = maxH + 'px';
        listEl.style.overflowY = 'auto';
      }
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);

    /* R89-B\uff1a\u8d85\u5c4f\u5e03\u5c40\u517c\u5bb9\u515c\u5e95\u3002
       CSS \u5f39\u6027\u5e03\u5c40\uff08.xtlp-body flex + .xtlp-list flex/overflow-y\uff09\u5df2\u4fdd\u8bc1\u5217\u8868\u81ea\u8eab\u53ef\u6eda\uff1b
       \u90e8\u5206\u8001 WebView \u5bf9 inset \u7f13\u5b58\u6216 flex \u8ba1\u7b97\u6709\u5dee\u5f02\uff0c\u6545\u5728\u6e32\u67d3\u540e\u518d\u7ed9\u5217\u8868\u8865\u4e00\u4e2a\u5b9e\u6d4b\u9ad8\u5ea6\u4e0a\u9650\uff08\u56fa\u5b9a\u503c\uff0c\u7981 clamp/min/max\uff09\u3002
       \u53ea\u5728\u5217\u8868\u786e\u5b9e\u62ff\u4e0d\u5230\u6709\u6548\u9ad8\u5ea6\u65f6\u624d\u751f\u6548\uff1b\u5bbd\u5ea6\u4e0d\u8db3\u65f6\u4e0d\u52a8\u3002 */
    (function () {
      if (!listEl || !root.getBoundingClientRect) return;
      var rect = null, h = 0;
      try { rect = root.getBoundingClientRect(); } catch (e) { rect = null; }
      if (rect && rect.height) h = rect.height;
      if (!h || h < 120) {
        try { h = window.innerHeight || 0; } catch (e2) { h = 0; }
      }
      if (h && h >= 120) {
        var maxH = h - 300;
        if (maxH < 120) maxH = 120;
        listEl.style.maxHeight = maxH + 'px';
        listEl.style.overflowY = 'auto';
      }
    })();
    /* pickfix：进页自动预选当前位置 —— 定位可用（原生桥 / 安全上下文 GPS）时
       自动走一次定位 + 逆地理，成功后把地址回显进黑条（curline）并点亮「发送」，
       即「进页即预选当前位置，拖动即改选」；「尚未选择位置」只在定位与逆地理
       都失败时出现。初始定位失败必须静默降级（不弹错误框、不 toast）；
       非安全上下文 Web（拿不到 geolocation）保持现状行为。
       用户已手动选择（chosen 非空）或调用方已带 current（initText）时让位，不覆盖。
       逆地理走既有链路（后端代理优先），拖动防竞态沿用 revSeq/切片闸门。 */
    function _autoLocate() {
      if (closed || initText || locBusy || mylocBusy || !_oneShotAvail()) return;
      locBusy = true;
      setChosen('', '正在定位当前位置…');
      _oneShotFix(function (r) {
        if (closed) return;
        locBusy = false;
        if (chosen) return;   // 用户已手动选择 / 拖动改选：自动结果让位
        if (!r || r.ok !== true || !isFinite(r.lat) || !isFinite(r.lng)) {
          setChosen('', '');   // 静默恢复「尚未选择位置」
          return;
        }
        setChosen('', '正在解析当前位置…');
        reverseGeocode(r.lat, r.lng, function (g) {
          if (closed || chosen) return;   // 迟到 / 用户已改选 → 丢弃
          if (!g || !g.text) { setChosen('', ''); return; }   // 逆地理失败 → 维持未选态（静默）
          nearbyResults = (g.pois && g.pois.length) ? g.pois : [];
          geoCtx = { adcode: g.adcode || '', city: g.city || '', province: g.province || '', lat: r.lat, lng: r.lng };
          var txt = _terseGeo(g);
          if (!txt) {
            var RR = window.XT_REGION;
            if ((g.province || g.city) && RR && typeof RR.textOf === 'function') {
              var t2 = RR.textOf(g.province, g.city, g.district);
              if (t2) txt = t2;
            }
          }
          if (!txt) { setChosen('', ''); return; }
          var subParts = [];
          if (g.district) subParts.push(g.district);
          if (g.streetBase) subParts.push(g.streetBase);
          setChosen(_clipText(txt), subParts.join(' · '), { lat: r.lat, lng: r.lng });
          _flyTo(r.lat, r.lng);   // 地图未就绪时 _mapDefaultView 也会采用 geoCtx
          renderList();
        });
      });
    }

    if (initText) setChosen(initText, '');
    renderList();
    try { if (inputEl.focus) inputEl.focus(); } catch (e9) {}
    _autoLocate();   // pickfix：进页自动预选（initText 已带选择时内部自动跳过）

    /* R130：注入并初始化真地图（本地 Leaflet 就绪失败 → 静默退回原 CSS 示意图，
       搜索/定位/历史等既有能力不受影响） */
    _ensureLeaflet(function (lfOk) {
      if (!lfOk || closed) return;
      try { _initMap(); } catch (eLf) {}
    });
  }

  window.XT_LOC_PICK = {
    pick: pick,
    last: last,
    isCoordinateText: isCoordinateText,
    LAST_KEY: LAST_KEY,
    RECENT_KEY: RECENT_KEY,
    openPicker: openPicker,
    recent: recentList
  };

})();
