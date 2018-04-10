import { NAMESPACE, duplexMap } from "./browser";
import { patchStyle } from "./style";
import { addGlobalEvent, getBrowserName, isEventName, eventHooks } from "./event";
import { toLowerCase, noop, typeNumber, emptyObject } from "react-core/util";
import { Renderer } from "react-core/createRenderer";

//布尔属性的值末必为true,false
//https://github.com/facebook/react/issues/10589


let isSpecialAttr = {
    style: 1,
    autoFocus: 1,
    innerHTML: 1,
    dangerouslySetInnerHTML: 1
};

let svgCache = {};
let strategyCache = {};
/**
 * 仅匹配 svg 属性名中的第一个驼峰处，如 viewBox 中的 wB，
 * 数字表示该特征在属性列表中重复的次数
 * -1 表示用 ":" 隔开的属性 (xlink:href, xlink:title 等)
 * https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute
 */
let svgCamelCase = {
    w: { r: 1, b: 1, t: 1 },
    e: { n: 1, t: 1, f: 1, p: 1, c: 1, m: 1, a: 2, u: 1, s: 1, v: 1 },
    o: { r: 1 },
    c: { m: 1 },
    p: { p: 1 },
    t: { s: 2, t: 1, u: 1, c: 1, d: 1, o: 1, x: 1, y: 1, l: 1 },
    l: { r: 1, m: 1, u: 1, b: -1, l: -1, s: -1 },
    r: { r: 1, u: 2, h: 1, w: 1, c: 1, e: 1 },
    h: { r: 1, a: 1, l: 1, t: 1 },
    y: { p: 1, s: 1, t: 1, c: 1 },
    g: { c: 1 },
    k: { a: -1, h: -1, r: -1, s: -1, t: -1, c: 1, u: 1 },
    m: { o: 1, l: 1, a: 1 },
    n: { c: 1, t: 1, u: 1 },
    s: { a: 3 },
    f: { x: 1, y: 1 },
    d: { e: 1, f: 1, m: 1, d: 1 },
    x: { c: 1 }
};

// SVG 属性列表中驼峰命名和短横线分隔命名特征值有重复
// 列出了重复特征中的短横线命名的属性名
let specialSVGPropertyName = {
    "overline-thickness": 2,
    "underline-thickness": 2,
    "overline-position": 2,
    "underline-position": 2,
    "stroke-miterlimit": 2,
    "baseline-shift": 2,
    "clip-path": 2,
    "font-size": 2,
    "font-size-adjust": 2,
    "font-stretch": 2,
    "font-style": 2,
    "text-decoration": 2,
    "vert-origin-x": 2,
    "vert-origin-y": 2,
    "paint-order": 2,
    "fill-rule": 2,
    "color-rendering": 2,
    "marker-end": 2,
    "pointer-events": 2,
    "units-per-em": 2,
    "strikethrough-thickness": 2,
    "lighting-color": 2
};

// 重复属性名的特征值列表
let repeatedKey = ["et", "ep", "em", "es", "pp", "ts", "td", "to", "lr", "rr", "re", "ht", "gc"];

function createRepaceFn(split) {
    return function (match) {
        return match.slice(0, 1) + split + match.slice(1).toLowerCase();
    };
}

let rhump = /[a-z][A-Z]/;
let toHyphen = createRepaceFn("-");
let toColon = createRepaceFn(":");

function getSVGAttributeName(name) {
    if (svgCache[name]) {
        return svgCache[name];
    }
    const key = name.match(rhump);
    if (!key) {
        return (svgCache[name] = name);
    }
    const [prefix, postfix] = [...key[0].toLowerCase()];
    let orig = name;
    if (svgCamelCase[prefix] && svgCamelCase[prefix][postfix]) {
        const count = svgCamelCase[prefix][postfix];

        if (count === -1) {
            return (svgCache[orig] = {
                name: name.replace(rhump, toColon),
                ifSpecial: true
            });
        }

        if (~repeatedKey.indexOf(prefix + postfix)) {
            const dashName = name.replace(rhump, toHyphen);
            if (specialSVGPropertyName[dashName]) {
                name = dashName;
            }
        }
    } else {
        name = name.replace(rhump, toHyphen);
    }

    return (svgCache[orig] = name);
}
function getFormValue(dom, props) {
    let type = dom.type || dom.tagName.toLowerCase();
    let number = duplexMap[type];
    if (number) {
        for(let i in controlledStrategy){
            if(props.hasOwnProperty(i)){
                return i; 
            }
        }
    }
    return "children";
}
export function diffProps(dom, lastProps, nextProps, fiber) {
    let isSVG = fiber.namespaceURI === NAMESPACE.svg;
    let tag = fiber.type;
    let controlled = "children";
    if( !isSVG && rform.test(fiber.type)){
        controlled = getFormValue(dom, nextProps);
    }
    //eslint-disable-next-line
    for (let name in nextProps) {
        if (name === controlled) {
            continue;
        }
        let val = nextProps[name];
        if (val !== lastProps[name]) {
            let which = tag + isSVG + name;
            let action = strategyCache[which];
            if (!action) {
                action = strategyCache[which] = getPropAction(dom, name, isSVG);
            }
            actionStrategy[action](dom, name, val, lastProps, fiber);
        }
    }
    //如果旧属性在新属性对象不存在，那么移除DOM eslint-disable-next-line
    for (let name in lastProps) {
        if (name === controlled) {
            continue;
        }
        if (!nextProps.hasOwnProperty(name)) {
            let which = tag + isSVG + name;
            let action = strategyCache[which];
            if (!action) {
                continue;
            }
            actionStrategy[action](dom, name, false, lastProps, fiber);
        }
    }
    controlledStrategy[controlled](dom, controlled, nextProps, lastProps, fiber );
}

function isBooleanAttr(dom, name) {
    let val = dom[name];
    return val === true || val === false;
}
/**
 * 根据一个属性所在的元素或元素的文档类型，就可以永久决定该使用什么策略操作它
 *
 * @param {any} dom 元素节点
 * @param {any} name 属性名
 * @param {any} isSVG
 * @returns
 */
function getPropAction(dom, name, isSVG) {
    if (isSVG && name === "className") {
        return "svgClass";
    }
    if (isSpecialAttr[name]) {
        return name;
    }
    if (isEventName(name)) {
        return "event";
    }
    if (isSVG) {
        return "svgAttr";
    }
    //img.width = '100px'时,取img.width为0,必须用setAttribute
    if ((name === "width" || name === "height")) {
        return "attribute";
    }
    if (isBooleanAttr(dom, name)) {
        return "booleanAttr";
    }
    return name.indexOf("data-") === 0 || dom[name] === void 666 ? "attribute" : "property";
}
let builtinStringProps = {
    className: 1,
    title: 1,
    name: 1,
    type: 1,
    alt: 1,
    lang: 1
};

let rform = /textarea|input|select/i;
function controlled(dom, name, nextProps, lastProps, fiber){
    uncontrolled(dom, name, nextProps, lastProps, fiber, true);
}
function uncontrolled(dom, name, nextProps, lastProps, fiber, ok) {
    let value = nextProps[name];
    let isSelect = fiber.type === "select";
    ok = ok || (isSelect && nextProps.multiple != lastProps. multiple);
    if(ok || lastProps === emptyObject){
        dom._persistValue = value;
        syncValue({target: dom}); //设置value/check
        var duplexType = "select";
        if(isSelect){
            syncOptions({
                target: dom
            });
        }else {
            duplexType = dom.type === "checkebox" || dom.type === "radio" ? "checked": "value";
        }
        var arr = duplexData[duplexType];
        fiber.controlledCb = arr[1];
        Renderer.controlledCbs.push(fiber);
    }
}

let controlledStrategy = {
    value: controlled,
    checked: controlled,
    defaultValue: uncontrolled,
    defaultChecked: uncontrolled,
    children: noop
};


export let actionStrategy = {
    innerHTML: noop,
    children: noop,
    style: function (dom, _, val, lastProps) {
        patchStyle(dom, lastProps.style || emptyObject, val || emptyObject);
    },
    autoFocus: function (dom) {
        if (duplexMap[dom.type] < 3 || dom.contentEditable === "true") {
            dom.focus();
        }
    },
    svgClass: function (dom, name, val) {
        if (!val) {
            dom.removeAttribute("class");
        } else {
            dom.setAttribute("class", val);
        }
    },
    svgAttr: function (dom, name, val) {
        // http://www.w3school.com.cn/xlink/xlink_reference.asp
        // https://facebook.github.io/react/blog/2015/10/07/react-v0.14.html#notable-enh
        // a ncements xlinkActuate, xlinkArcrole, xlinkHref, xlinkRole, xlinkShow,
        // xlinkTitle, xlinkType eslint-disable-next-line
        let method = typeNumber(val) < 3 && !val ? "removeAttribute" : "setAttribute";
        let nameRes = getSVGAttributeName(name);
        if (nameRes.ifSpecial) {
            let prefix = nameRes.name.split(":")[0];
            // 将xlinkHref 转换为 xlink:href
            dom[method + "NS"](NAMESPACE[prefix], nameRes.name, val || "");
        } else {
            dom[method](nameRes, val || "");
        }
    },
    booleanAttr: function (dom, name, val) {
        // 布尔属性必须使用el.xxx = true|false方式设值 如果为false, IE全系列下相当于setAttribute(xxx,""),
        // 会影响到样式,需要进一步处理 eslint-disable-next-line
        dom[name] = !!val;
        if (dom[name] === false) {
            dom.removeAttribute(name);
        } else if (dom[name] === "false") {
            //字符串属性会将它转换为false
            dom[name] = "";
        }
    },
    attribute: function (dom, name, val) {
        if (val == null || val === false) {
            return dom.removeAttribute(name);
        }
        try {
            dom.setAttribute(name, val);
        } catch (e) {
            console.warn("setAttribute error", name, val); // eslint-disable-line
        }
    },
    property: function (dom, name, val) {
        // 尝试直接赋值，部分情况下会失败，如给 input 元素的 size 属性赋值 0 或字符串
        // 这时如果用 setAttribute 则会静默失败
        try {
            if (!val && val !== 0) {
                //如果它是字符串属性，并且不等于""，清空
                if (builtinStringProps[name]) {
                    dom[name] = "";
                }
                dom.removeAttribute(name);
            } else {
                dom[name] = val;
            }
        } catch (e) {
            try {//修改type会引发多次报错
                dom.setAttribute(name, val);
            } catch (e) {/*ignore*/ }
        }
    },
    event: function (dom, name, val, lastProps, fiber) {
        let events = dom.__events || (dom.__events = {});
        events.vnode = fiber;
        let refName = toLowerCase(name.slice(2));
        if (val === false) {
            delete events[refName];
        } else {
            if (!lastProps[name]) {
                //添加全局监听事件
                let eventName = getBrowserName(name);
                let hook = eventHooks[eventName];
                addGlobalEvent(eventName);
                if (hook) {
                    hook(dom, eventName);
                }
            }
            //onClick --> click, onClickCapture --> clickcapture
            events[refName] = val;
        }
    },
    dangerouslySetInnerHTML: function (dom, name, val, lastProps) {
        let oldhtml = lastProps[name] && lastProps[name].__html;
        let html = val && val.__html;
        html = html == null ? "" : html;
        if (html !== oldhtml) {
            dom.innerHTML = html;
        }
    }
};



function syncValue({target: dom}){
    let name = dom.type === "textarea" ? "innerHTML" : /check|radio/.test(dom.type) ? "checked" : "value";
    let value = dom._persistValue;
    if (dom[name] !== value) {
        dom.__anuSetValue = true;//抑制onpropertychange
        dom[name] = dom._persistValue = value;
        dom.__anuSetValue = false;
    }
}
function syncOptions(e) {
    let target = e.target,
        value = target._persistValue,
        options = target.options;
    if (target.multiple) {
        updateOptionsMore(options, options.length, value);
    } else {
        updateOptionsOne(options, options.length, value);
    }
    target._setSelected = true;
}

var duplexData = {
    select: [["change"],syncOptions],
    value:[["change","input"],syncValue],
    checked:[["change","click"],syncValue]
};

function updateOptionsOne(options, n, propValue) {
    let stringValues = {},
        noDisableds = [];
    for (let i = 0; i < n; i++) {
        let option = options[i];
        let value = option.duplexValue;
        if (!option.disabled) {
            noDisableds.push(option);
        }
        if (value === propValue) {
            //精确匹配
            return setOptionSelected(option, true);
        }
        stringValues["&"+value] = option;
    }
    let match = stringValues["&"+propValue];
    if (match) {
        //字符串模糊匹配
        return setOptionSelected(match, true);
    }
    if (n && noDisableds[0]) {
        //选中第一个没有变disable的元素
        setOptionSelected(noDisableds[0], true);
    }
}

function updateOptionsMore(options, n, propValue) {
    let selectedValue = {};
    try {
        for (let i = 0; i < propValue.length; i++) {
            selectedValue["&" + propValue[i]] = true;
        }
    } catch (e) {
        /* istanbul ignore next */
        console.log('the value of multiple select should be an array'); // eslint-disable-line
    }
    for (let i = 0; i < n; i++) {
        let option = options[i];
        let value = option.duplexValue;
        let selected = selectedValue.hasOwnProperty("&" + value);
        setOptionSelected(option, selected);
    }
}

function setOptionSelected(dom, selected) {
    dom.selected = selected;
}