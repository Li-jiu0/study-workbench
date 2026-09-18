/* ============================================================
 * xt-region.js —— 中国省 / 市 / 区数据 + 选择辅助 + 逆地理编码
 * 批次：R86-B（个人信息页改造 · 需求4 地区选择）
 *
 * 设计约束：
 *   1) ES5 语法（老 WebView / Chrome 50+ 可解析）：无箭头函数、无可选链、
 *      无空值合并、无顶层 await、无 const/let（用 var）、无模板字符串。
 *   2) 全部挂在 window.XT_REGION 上，不污染全局；不依赖任何第三方库。
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
   * 规整腾讯 POI 数组 → [{title, address, category, distance}]。
   * distance 保留腾讯原始值（可能是数字或文案），绝不自行按经纬度计算。
   * @param {Array} pa
   * @returns {Array}
   */
  function _poiList(pa) {
    if (Object.prototype.toString.call(pa) !== '[object Array]') return [];
    var out = [], i, p;
    for (i = 0; i < pa.length; i++) {
      p = pa[i] || {};
      if (!p.title) continue;
      out.push({
        title: String(p.title),
        address: p.address ? String(p.address) : '',
        category: p.category ? String(p.category) : '',
        distance: (p._distance == null || String(p._distance) === '') ? '' : String(p._distance)
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

  /**
   * 逆地理编码（链式降级）：经纬度 → 街道级中文地址 + 周边 POI。
   * 腾讯优先（含 get_poi=1 一次取回地址与周边 POI）；腾讯失败降级 amap →
   * nominatim；全失败回调 null，由调用方降级手动选择。坐标 lat,lng 按腾讯
   * 「纬度,经度」顺序拼接（与既有实现一致）。
   * @param {number} lat 纬度
   * @param {number} lng 经度
   * @param {function} cb 回调（失败 / 超时一律给 null，绝不抛异常）
   */
  function reverseGeocode(lat, lng, cb) {
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

  /** 浏览器定位（失败不抛异常，统一走 err 回调）。 */
  function locate(cb) {
    if (!navigator || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
      cb({ ok: false, reason: 'unsupported' });
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
          if (code === 1) { once({ ok: false, reason: 'denied' }); return; }
          retryOrFail(code === 2 ? 'unavailable' : (code === 3 ? 'timeout' : 'error'));
        }, { enableHighAccuracy: true, timeout: innerMs, maximumAge: maxAge });
      } catch (e) {
        if (timer) clearTimeout(timer);
        retryOrFail('error');
      }
    }
    function retryOrFail(reason) {
      if (settled) return;
      if (reason === 'denied') { once({ ok: false, reason: 'denied' }); return; }
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
    nearby: nearby
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
   * ES2017 上限：仅用 var + function，不用 ?. / ?? / 对象展开 / 反引号模板 等。
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

  /** 读常用城市列表（失败返回 []）。 */
  function recentList() {
    var ls = _safeLS();
    if (!ls) return [];
    var raw = null;
    try { raw = ls.getItem(RECENT_KEY); } catch (e) { raw = null; }
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e2) { arr = null; }
    if (Object.prototype.toString.call(arr) !== '[object Array]') return [];
    var out = [], i, s;
    for (i = 0; i < arr.length; i++) {
      s = (arr[i] == null) ? '' : String(arr[i]).replace(/^\s+|\s+$/g, '');
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }

  /** 把一个地址文本推入常用城市（去重 + LRU 置顶 + ≤8，失败静默）。 */
  function recentPush(text) {
    var t = (text == null) ? '' : String(text).replace(/^\s+|\s+$/g, '');
    if (!t) return;
    var ls = _safeLS();
    if (!ls) return;
    var list = recentList();
    var out = [t], i;
    for (i = 0; i < list.length; i++) { if (list[i] !== t) out.push(list[i]); }
    if (out.length > RECENT_MAX) out = out.slice(0, RECENT_MAX);
    try { ls.setItem(RECENT_KEY, JSON.stringify(out)); } catch (e) {}
  }

  /* ---------------- R88-J：微信式位置选择组件（方案 A） ----------------
   * 说明：不引第三方地图库。地图区域用【纯 CSS + 内联 SVG】绘制的静态示意（无外链图片、
   *   无网络依赖），叠加 data-icon="map-pin" 的 Pin。地址候选来自 XT_REGION.search()
   *   省/市/区联想 + 「用当前位置」的逆地理编码结果。确认仅回传 text（坐标绝不进字符串）。
   */
  var _pickSeq = 0;
  var PIN_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  var SEARCH_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#9aa3b2" '+
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>';

  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

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
      '.xtlp-map{flex:0 0 auto;position:relative;height:168px;margin:0 12px;border-radius:14px;overflow:hidden;'+
        'background:linear-gradient(135deg,#dbe7f7,#eef4fb 55%,#e5f0e6);border:1px solid #e6e9f0}'+
      '.xtlp-map::before{content:"";position:absolute;left:-10%;top:38%;width:120%;height:10px;background:rgba(255,255,255,.75);'+
        'transform:rotate(-8deg);box-shadow:0 34px 0 rgba(255,255,255,.55),0 -30px 0 rgba(255,255,255,.4)}'+
      '.xtlp-map::after{content:"";position:absolute;left:30%;top:-10%;width:10px;height:120%;background:rgba(255,255,255,.55);'+
        'transform:rotate(12deg)}'+
      '.xtlp-pin{position:absolute;left:50%;top:46%;transform:translate(-50%,-100%);width:40px;height:40px;border-radius:50%;'+
        'background:#eb5757;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(235,87,87,.4)}'+
      '.xtlp-pin::after{content:"";position:absolute;left:50%;bottom:-6px;transform:translateX(-50%) rotate(45deg);width:14px;height:14px;'+
        'background:#eb5757;border-radius:2px}'+
      '.xtlp-pin svg{position:relative;z-index:1}'+
      '.xtlp-curline{position:absolute;left:12px;right:12px;bottom:10px;background:rgba(31,41,55,.82);color:#fff;border-radius:10px;'+
        'padding:7px 12px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      /* R90 item3: flex:1 1 0% -> 1 1 auto + min-height:180px 下限（矮屏下保证列表可用，靠自身 overflow-y 滚） */
      '.xtlp-list{flex:1 1 auto;min-height:182px;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px 12px 0;background:#fff;border-radius:14px;border:1px solid #e6e9f0}'+
      '.xtlp-sec{padding:10px 14px 4px;font-size:12px;font-weight:700;color:#9aa3b2;letter-spacing:.5px}'+
      '.xtlp-item{display:flex;align-items:center;gap:10px;padding:12px 14px;font-size:14px;color:#1f2937;cursor:pointer;border-top:1px solid #eef1f6}'+
      '.xtlp-item:active{background:#f5f7fb}'+
      '.xtlp-item.on{color:#5B8DEF;font-weight:700}'+
      '.xtlp-item .xtlp-tick{margin-left:auto;color:#5B8DEF;flex:none}'+
      '.xtlp-sub{color:#9aa3b2;font-size:12px}'+
      '.xtlp-empty{padding:26px 14px;text-align:center;color:#9aa3b2;font-size:13px}'+
      '.xtlp-foot{flex:0 0 auto;padding:10px 12px 16px;display:flex;gap:10px;background:#fff;border-top:1px solid #e6e9f0}'+
      '.xtlp-loc{flex:1;border:1px solid #5B8DEF;background:transparent;color:#5B8DEF;border-radius:10px;padding:10px;font-size:14px;cursor:pointer}'+
      '.xtlp-cancel{flex:none;border:1px solid #e6e9f0;background:transparent;color:#6b7280;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer}'+
      /* R90 item3：矮屏（总高 ≤ 560px：480/400 都落进来）收紧固定高度块，
         避免 overhead(293px)+列表 foot 超出视口导致截断。全固定值 + @media，禁 clamp/min/max。 */
      '@media (max-height:560px){'+
        '.xtlp-head{padding:7px 10px}'+
        '.xtlp-search{margin:7px 12px;padding:6px 10px}'+
        '.xtlp-map{height:110px}'+
        '.xtlp-list{margin:7px 12px 0}'+
        '.xtlp-foot{padding:8px 12px 10px}'+
      '}';

    var style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);

    var html = '';
    html += '<div class="xtlp-head"><button type="button" class="xtlp-back" data-act="cancel">取消</button>';
    html += '<span class="xtlp-title">' + _escAttr(title) + '</span>';
    html += '<button type="button" class="xtlp-ok" data-act="ok" disabled>' + _escAttr(confirmText) + '</button></div>';
    html += '<div class="xtlp-search">' + SEARCH_SVG +
      '<input type="text" class="xtlp-input" placeholder="搜索地址 / 省 / 市 / 区，如：天河、杭州" autocomplete="off"></div>';
    html += '<div class="xtlp-map"><div class="xtlp-pin">' + PIN_SVG + '</div>' +
      '<div class="xtlp-curline">尚未选择位置</div></div>';
    html += '<div class="xtlp-list"></div>';
    html += '<div class="xtlp-foot"><button type="button" class="xtlp-loc" data-act="loc">用当前位置</button>' +
      '<button type="button" class="xtlp-cancel" data-act="cancel">取消</button></div>';

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
    var nearbyResults = [];  // 最近一次定位得到的周边 POI
    var locBusy = false;     // 定位中：置位后不再启动第二次，防止并发重复请求

    function setChosen(text, sub) {
      chosen = (text == null) ? '' : String(text).replace(/^\s+|\s+$/g, '');
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

    function itemRow(text, sub) {
      var cls = 'xtlp-item' + (text === chosen ? ' on' : '');
      var subHtml = sub ? ' <span class="xtlp-sub">' + _escAttr(sub) + '</span>' : '';
      return '<div class="' + cls + '" data-text="' + _escAttr(text) + '">' + _escAttr(text) + subHtml +
        (text === chosen ? '<span class="xtlp-tick">✓</span>' : '') + '</div>';
    }

    function renderList() {
      var html2 = '';
      var i, R;
      if (kw) {
        R = window.XT_REGION;
        var hits = (R && typeof R.search === 'function') ? R.search(kw, 40) : [];
        if (!hits.length) { listEl.innerHTML = '<div class="xtlp-empty">没找到「' + _escAttr(kw) + '」，换个关键词试试</div>'; return; }
        html2 += '<div class="xtlp-sec">搜索结果</div>';
        for (i = 0; i < hits.length; i++) {
          var sub = (hits[i].province && hits[i].province !== hits[i].city) ? hits[i].province : '';
          html2 += itemRow(hits[i].text, sub);
        }
        listEl.innerHTML = html2;
        return;
      }
      if (nearbyResults.length) {
        html2 += '<div class="xtlp-sec">附近位置</div>';
        for (i = 0; i < nearbyResults.length; i++) {
          var poi = nearbyResults[i] || {};
          var psub = poi.address || poi.category || '';
          html2 += itemRow(poi.title, psub);
        }
      }
      var recent = recentList();
      if (recent.length) {
        html2 += '<div class="xtlp-sec">常用城市</div>';
        for (i = 0; i < recent.length; i++) html2 += itemRow(recent[i], '常用');
      }
      R = window.XT_REGION;
      var provs = (R && typeof R.provinces === 'function') ? R.provinces() : [];
      if (provs.length) {
        html2 += '<div class="xtlp-sec">热门 / 全部省份</div>';
        for (i = 0; i < provs.length && i < 12; i++) html2 += itemRow(provs[i], '省');
      }
      if (!html2) html2 = '<div class="xtlp-empty">暂无可选地址</div>';
      listEl.innerHTML = html2;
    }

    function finish(text) {
      if (closed) return;
      closed = true;
      try { if (root.parentNode) root.parentNode.removeChild(root); } catch (e) {}
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (text) recentPush(text);
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
        renderList();
      }, 160);
    });

    listEl.addEventListener('click', function (ev) {
      var node = ev.target;
      while (node && node !== listEl && !(node.getAttribute && node.getAttribute('data-text') !== null)) { node = node.parentNode; }
      if (!node || node === listEl) return;
      var t = node.getAttribute('data-text');
      if (t == null) return;
      setChosen(t, '');
    });

    root.addEventListener('click', function (ev) {
      var n = ev.target;
      while (n && n !== root && !(n.getAttribute && n.getAttribute('data-act'))) { n = n.parentNode; }
      if (!n || n === root) return;
      var act = n.getAttribute('data-act');
      if (act === 'cancel') { finish(null); return; }
      if (act === 'ok') { if (chosen) finish(chosen); return; }
      if (act === 'loc') {
        if (locBusy) return;
        locBusy = true;
        setChosen('', '正在定位…');
        locate(function (r) {
          if (closed) return;
          if (!r || r.ok === false) { setChosen('', '定位失败，可搜索或手动输入'); locBusy = false; _failToast(); return; }
          setChosen('', '已获取坐标，正在解析地址…');
          reverseGeocode(r.lat, r.lng, function (g) {
            if (closed) return;
            locBusy = false;
            if (!g || !g.text) { setChosen('', '地址解析失败，可搜索或手动输入'); return; }
            var list = (g.pois && g.pois.length) ? g.pois : [];
            nearbyResults = list;
            var txt = _terseGeo(g);
            if (!txt) {
              var RR = window.XT_REGION;
              if ((g.province || g.city) && RR && typeof RR.textOf === 'function') {
                var t2 = RR.textOf(g.province, g.city, g.district);
                if (t2) txt = t2;
              }
            }
            setChosen(_clipText(txt), '');
            renderList();
          });
        });
        return;
      }
    });

    /* R89-B\uff1a\u7a97\u53e3\u5c3a\u5bf8\u53d8\u5316\uff08\u65cb\u5c4f / \u8f6f\u952e\u76d8\uff09\u65f6\u91cd\u7b97\u5217\u8868\u9ad8\u5ea6\u4e0a\u9650\u3002 */
    function onResize() {
      if (closed || !listEl) return;
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
    if (initText) setChosen(initText, '');
    renderList();
    try { if (inputEl.focus) inputEl.focus(); } catch (e9) {}
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
