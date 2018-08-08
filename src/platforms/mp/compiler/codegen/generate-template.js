/* @flow */

import TAG_MAP from '../tag-map'
// import { eventTypeMap } from 'mp/util/index'

const vbindReg = /^(v-bind)?:/
const vonReg = /^v-on:|@/

export function generateTemplate (ast, options = {}): string {
  const templateGenerator = new TemplateGenerator(ast, options)
  return templateGenerator.generate()
}

export class TemplateGenerator {
  constructor (ast, options = {}) {
    const {
      // platform = 'wechat',
      name = 'defaultName',
      imports = [],
      slots = []
    } = options

    Object.assign(this, {
      ast,
      name,
      imports,
      slots
    })
  }

  generate () {
    try {
      const importsCode = this.genImports()
      const code = this.genElement(this.ast)
      return [
        importsCode,
        `<template name="${this.name}">${code}</template>`
      ].join('')
    } catch (err) {
      return this.genError(err)
    }
  }

  genImports () {
    const { imports } = this
    return Object.keys(imports)
      .map(name => `<import src="${imports[name].src}"/>`)
      .join('')
  }

  genElement (el): string {
    if (el.ifConditions && !el.ifConditionsGenerated) {
      return this.genIfConditions(el)
    } else if (this.isComponent(el)) {
      return this.genComponent(el)
    } else if (el.type === 1) {
      return this.genTag(el)
    } else {
      return this.genText(el)
    }
  }

  isComponent (el): boolean {
    return el._cid && !!this.imports[el.tag]
  }

  genComponent (el): string {
    const { _cid, tag } = el
    const compInfo = this.imports[tag]
    const { hash } = compInfo
    const compName = `${tag}$${hash}`
    const defaultSlot = `$defaultSlot: 'defaultSlot'`
    const data = [
      `...$root[ $kk + ${_cid} ]`,
      `$root`,
      defaultSlot
    ].join(', ')

    return `<template is="${compName}" data="{{${data}}}"/>`
  }

  genTag (el): string {
    const { tag } = el
    const mpTag = TAG_MAP[tag] || tag
    const klass = this.genClass(el)
    const style = this.genStyle(el)
    const attrs = this.genAttrs(el)
    const events = this.genEvents(el)
    const _if = this.genIf(el)
    const _for = this.genFor(el)

    const startTag = `<${[
      mpTag,
      _if,
      _for,
      klass,
      style,
      attrs,
      events
    ].join('')}>`

    const endTag = `</${mpTag}>`

    return [startTag, this.genChildren(el), endTag].join('')
  }

  genClass (el): string {
    const { tag, classBinding, _hid } = el
    let { staticClass = '' } = el
    let klass = [`_${tag}`]
    staticClass = staticClass.replace(/"/g, '')
    if (staticClass) {
      klass.push(staticClass)
    }
    if (classBinding) {
      klass.push(`{{ _h[ ${_hid} ].cl }}`)
    }
    klass = klass.join(' ')
    return ` class="${klass}"`
  }

  genStyle (el): string {
    const { styleBinding, _hid } = el
    let { staticStyle = '' } = el
    let style = []
    staticStyle = staticStyle.replace(/"|{|}/g, '').split(',').join('; ')
    if (staticStyle) {
      style.push(staticStyle)
    }
    if (styleBinding) {
      style.push(`{{ _h[ ${_hid} ].st }}`)
    }
    style = style.filter(e => e).join(' ')
    return style ? ` style="${style}"` : ''
  }

  genAttrs (el): string {
    const { attrsList = [], _hid } = el
    let attrs = attrsList.map((attr) => {
      const { name, value } = attr
      if (vonReg.test(name)) {
        return ''
      } else if (vbindReg.test(name)) {
        const realName = name.replace(vbindReg, '')
        return `${realName}="{{ _hid[ ${_hid} ][ '${realName}' ] }}"`
      } else {
        return `${name}="${value}"`
      }
    })
    attrs = attrs.filter(e => e).join(' ')
    return attrs ? ` ${attrs}` : ''
  }

  genEvents (el): string {
    const { events, tag, _hid } = el
    if (!events) {
      return ''
    }
    let eventAttrs = Object.keys(events).map(type => {
      const event = events[type]
      const { modifiers } = event
      const { stop, capture } = modifiers
      let mpType = type
      let binder = 'bind'
      if (stop) {
        binder = 'catchbind'
      } else if (capture) {
        binder = 'capturebind'
      }
      if (type === 'change' && (tag === 'input' || tag === 'textarea')) {
        mpType = 'blur'
      } else {
        mpType = type === 'click' ? 'tap' : mpType
      }
      return `${binder}${mpType}="proxyEvent"`
    })
    eventAttrs = eventAttrs.join(' ')
    return ` data-cid="{{ cid }}" data-hid="{{ ${_hid} }}" ${eventAttrs}`
  }

  genIfConditions (el): string {
    el.ifConditionsGenerated = true
    if (!el.ifConditions) {
      return ''
    }
    return el.ifConditions
      .map(cond => {
        const { block } = cond
        return this.genElement(block)
      })
      .filter(e => e)
      .join('')
  }

  genIf (el): string {
    const { _hid } = el

    if (el.if) {
      return ` wx:if="{{ _h[ ${_hid} ]._if }}"`
    } else if (el.elseif) {
      return ` wx:elif="{{ _h[ ${_hid} ]._if }}"`
    } else if (el.else) {
      return ` wx:else`
    }
    return ''
  }

  genFor (el): string {
    if (!el.for) {
      return ''
    }
    const { _hid, iterator1, key = '' } = el
    const keyName = key.replace(/^\w*\./, '')
    const _for = [
      ` wx:for="{{ _h[ ${_hid} ].li }}"`
    ]
    iterator1 && _for.push(` wx:for-index="${iterator1}"`)
    keyName && _for.push(` wx:key="${keyName}"`)
    return _for.join('')
  }

  genText (el): string {
    const { text = '' } = el
    if (el.static) {
      return text
    }
    return `{{ _h[ ${el._hid} ].t }}`
  }

  genChildren (el): string {
    if (!el || !el.children || !el.children.length) {
      return ''
    }
    return el.children.map(child => this.genElement(child)).join('')
  }

  genError (err: Error) {
    return `<template name="${this.name}">compile error: ${err.toString()}\n${err.stack}</template>`
  }
}

