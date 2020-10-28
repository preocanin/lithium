import { ListItem } from "@material-ui/core";
import Container from "@material-ui/core/Container";
import Fab from "@material-ui/core/Fab/Fab";
import Icon from "@material-ui/core/Icon/Icon";
import List from "@material-ui/core/List/List";
import Paper from "@material-ui/core/Paper";
import useTheme from "@material-ui/core/styles/useTheme";
import { CSSProperties } from "@material-ui/core/styles/withStyles";
import Typography from "@material-ui/core/Typography/Typography";
import useMediaQuery from "@material-ui/core/useMediaQuery/useMediaQuery";
import hljs from 'highlight.js';
// import "highlight.js/styles/vs2015.css";
import marked, { lexer } from "marked";
import React, { useEffect, useState } from "react";
import { Footer } from "./Footer";
import brushed_bg from "./images/brushed.jpg";
import brushed_bg_white from "./images/brushed_white.jpg";

let DOC_ROOT = "https://raw.githubusercontent.com/matt-42/lithium/master/docs/";

if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development')
  DOC_ROOT = process.env.PUBLIC_URL + "/docs/";  // dev mode

const docUrls: { [s: string]: string } = {
  "introduction": "introduction.md",
  "getting-started": "getting_started.md",
  "http-server": "http_server.cc",
  "http-client": "http_client.cc",
  "json": "json.cc",
  "sql": "sql.cc",
  "metamap": "metamap.cc",
  "symbol": "symbol.cc"
}
for (let k of Object.keys(docUrls))
  docUrls[k] = DOC_ROOT + docUrls[k];

function formatUrl(s: string) {
  return s.toLowerCase().replace("c++", "cpp").replace(/[^a-zA-Z0-9]+/g, "-");
}

interface SectionNode {
  text: string,
  depth: number,
  children: { [k: string]: SectionNode },
  parent: SectionNode | null
};

export const sectionAnchor = (item: SectionNode) => {
  let path: string[] = [];
  let it: SectionNode | null = item;
  while (it) {
    path.unshift(it.text);
    it = it.parent;
  }
  return "#" + path.map(formatUrl).join("/");
}

export const sectionUrl = (item: SectionNode) => {
  return process.env.PUBLIC_URL + "/" + sectionAnchor(item);
}

export const sectionPath = (item: SectionNode) => {
  let path: string[] = [];
  let it: SectionNode | null = item;
  while (it) {
    path.unshift(it.text);
    it = it.parent;
  }

  return path.join(" / ");
}

export type DocHierarchy = { [k: string]: SectionNode };
export type DocIndexEntry = { contents: {text: string, type:"code"|"text"}[], section: SectionNode, depth: number };
export type DocIndex = DocIndexEntry[];

function addToHierarchy(item: any, hierarchy: DocHierarchy, parents: (SectionNode | null)[]) {
  let itempos = item.depth - 1;
  let parentpos = item.depth - 2;

  if (item.depth > 1) {
    // find parent.
    while (parentpos > 0 && !parents[parentpos]) parentpos--;

    let parent = parents[parentpos] as SectionNode;

    // add item as child to parent.
    parent.children[item.text] = { text: item.text, depth: item.depth, children: {}, parent };

    // add item to the parent array.
    // while (parents.length < item.depth) parents.push(null);
    parents.length = itempos + 1;
    parents[itempos] = parent.children[item.text];
  }
  else {
    hierarchy[item.text] = { text: item.text, depth: item.depth, children: {}, parent: null };
    parents.length = itempos + 1;
    parents[0] = hierarchy[item.text];
  }

  return parents[itempos] as SectionNode;
}

const docRendererHierarchy = {} as DocHierarchy;
const docRendererParents = [] as (SectionNode | null)[];

const docRenderer = {
  code(code: string, infostring: string, escaped: boolean) {
    if (infostring === "") infostring = "c++"
    return `<pre><code class="hljs ${infostring}">${hljs.highlight(infostring, code).value}</code></pre>`;
  },
  heading(text: string, level: number) {
    let section = addToHierarchy({ text, depth: level }, docRendererHierarchy, docRendererParents);

    return `
    <a name="${sectionAnchor(section).substring(1)}" class="anchor" href="${sectionAnchor(section)}" style="top: -90px; display: block;
    position: relative;
    top: -60px;
    visibility: hidden;">
    <h${level} class="MuiTypography-root MuiTypography-h${level}" style="margin-bottom: ${10 * (6 - level)}px; margin-top: ${10 * (6 - level)}px">
    <span class="header-link"></span>
    </a>
    ${text.toLowerCase()}
    </h${level}>`;
  },
  paragraph(src: string) {
    return `<p class="MuiTypography-root MuiTypography-body1">${src}</p>`
  },
  link(href: string | null, title: string | null, text: string): string {
    return `<a href=${href} 
              ${title ? `title='${title}'` : ""} 
              class="MuiTypography-root MuiLink-root MuiLink-underline MuiTypography-colorPrimary">
              ${text}
           </a>`

  }
};

function cppToMarkdown(code: string) {
  // Convert c++ to markdown:
  // replace c++ comment with markdown c++ code
  let marker = "__documentation_starts_here__";
  let markerpos = code.indexOf(marker)
  if (markerpos !== -1)
    code = code.substring(markerpos + marker.length);
  code = code.replace(/\n[\s]*\/\*/g, '\n```\n');
  code = code.replace(/\n[\s]*\*\/[\s]*/g, '\n```c++\n');
  code = '```c++\n' + code + '```\n';

  code = code.replace(/```c\+\+[\s\n]*```/, '');
  code = code.replace(/```c\+\+[\s]*}[\s]*```/, '');
  code = code.replace(/```c\+\+[\s\n]*```/, '');

  return code;
}



export async function indexDocumentation()
  : Promise<[DocHierarchy, DocIndex]> {

  let searchIndex: DocIndex = [];
  let hierarchy: DocHierarchy = {};

  for (let url of Object.values(docUrls)) {
    let content: string = await fetch(url).then(r => r.text());

    let items: any[] = lexer(url.split('.').pop() === "md" ? content : cppToMarkdown(content));

    let parents: (SectionNode | null)[] = [];
    for (let item of items) {
      if (item.type === "heading") {

        let itempos = item.depth - 1;
        addToHierarchy(item, hierarchy, parents);

        // index item
        searchIndex.push({ contents: [], section: parents[itempos] as SectionNode, depth: item.depth });
      }
      else {
        // index non headings nodes.
        if (parents.length)
        {
          const type = item.type === "code" ? "code" : "text";
          searchIndex[searchIndex.length - 1].contents.push({text: item.text || "", type});
        }
        // searchIndex.push({ text: item.text || "", section: parents[parents.length - 1] as SectionNode, depth: 99 });
      }
    }
  }
  searchIndex.sort((a, b) => {
    if (a.depth < b.depth) return -1;
    else return 1;
  })
  return [hierarchy, searchIndex];
}

export const documentationIndex = indexDocumentation();

async function generateDocumentation(doc_url: string) {
  marked.use({ renderer: docRenderer as any });

  // Fecth the c++ code.
  let code: string = await fetch(doc_url).then(r => r.text());
  // Remove doc preambule.

  return marked(doc_url.split('.').pop() === "md" ? code : cppToMarkdown(code));
}

const docsHtml: { [sectionName: string]: Promise<string> } = {};

for (let sectionName of Object.keys(docUrls)) {
  docsHtml[sectionName] = generateDocumentation(docUrls[sectionName]);
}

const DocumentationMenuRec = (props: { currentSection: string, section: SectionNode, hidden?: boolean, onLinkClick: () => void }) => {
  const hidden = props.hidden === undefined ? false : props.hidden;
  const section = props.section;
  const [open, setOpen] = useState(props.currentSection.startsWith(sectionAnchor(section)));
  const theme = useTheme();
  useEffect(() => {
    if (!open && props.currentSection.startsWith(sectionAnchor(section)))
      setOpen(true);
  }, [props.currentSection, section])


  if (!section) return <></>;

  const children = <List disablePadding>{
    Object.values(section.children).map((item) => <DocumentationMenuRec 
      currentSection={props.currentSection} 
      onLinkClick={props.onLinkClick}
      key={item.text} section={item} hidden={hidden || !open} />)}
  </List>

  if (section.depth === 1)
    return <>
      <ListItem key={section.text} button
        onClick={() => setOpen(!open)}
        style={{ paddingLeft: `${10 * section.depth}px`, color: theme.palette.text.primary }}>
        <span style={{ fontFamily: "Major Mono Display" }}>{section.text.toLowerCase()}</span>
      </ListItem>
      {children}
    </>
  else
    return <>
      <ListItem key={section.text} button
        component="a"
        selected={props.currentSection === sectionAnchor(section)}
        href={sectionUrl(section)}
        onClick={props.onLinkClick}
        style={{ display: hidden ? "none" : "block", paddingLeft: `${10 * section.depth}px`, color: theme.palette.text.primary }}>
        <Typography>{section.text}</Typography>
      </ListItem>
      {children}
    </>

}

const DocumentationMenu = (props: { currentSection: string, hierarchy: DocHierarchy, onLinkClick: () => void }) => {
  if (!props.hierarchy) return <></>;
  return <List disablePadding>
    {Object.values(props.hierarchy).map((item: SectionNode) =>
      <DocumentationMenuRec
        currentSection={props.currentSection} 
        key={item.text}
        section={item}
        onLinkClick={props.onLinkClick} />)}
  </List>
}

export const Documentation = (props: { hash: string }) => {

  const theme = useTheme();
  const screen700 = useMediaQuery('(min-width:700px)');

  const [content, setContent] = useState("");
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [currentSection, setCurrentSection] = useState("");
  const [mobileMenuOpen, setmobileMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setHierarchy((await documentationIndex)[0]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const split = props.hash.split("/");
      const mainSection = split[0].substring(1);
      if (mainSection !== currentSection)
      {
        setCurrentSection(mainSection);
        if (!docsHtml[mainSection])
        setContent(mainSection + ": Section not found");
        else
        await docsHtml[mainSection].then(c => setContent(c));
      }

      // Scroll into the right section.
      let found = false;
      while (!found)
      {

        let collection = document.getElementsByClassName("anchor");
        for (let i = 0; i < collection.length; i++)
        {
          let el = collection.item(i) as HTMLLinkElement;
          if (el && el.href.endsWith(props.hash))
          {
            found = true;
            el.scrollIntoView();
            break;
          }
          
        }
        if (!found) // sometime we need to wait because the doc is not mounted yet.
          await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();

  }, [props.hash, currentSection]);

  let dark = theme.palette.type === 'dark';

  let menuStyle: CSSProperties = { position: "fixed", width: "220px", top: "100px", marginLeft: "-240px", height: "calc(100% - 100px)", overflowY: "auto" };
  let docStyle: CSSProperties = { flexGrow: 1, textAlign: "left", padding: "20px" };
  let mobileOpenMenuButton = <></>
  if (!screen700) {

    menuStyle = {
      ...menuStyle,
      display: mobileMenuOpen ? "block" : "none",
      marginLeft: "0px", width: "100%",
      top: "0px", 
      paddingTop: "100px",
      backgroundImage: `url("${dark ? brushed_bg : brushed_bg_white}")`,
    };
    docStyle = { ...docStyle, width:"100%"}

    mobileOpenMenuButton = <Fab color="primary" aria-label="show_menu"
      // hidden={mobileMenuOpen}
      onClick={() => { setmobileMenuOpen(!mobileMenuOpen); }}
      style={{
        zIndex: 3000,
        position: 'fixed',
        bottom: theme.spacing(2),
        left: theme.spacing(2),
      }}>
      <Icon>{mobileMenuOpen ? "close" : "view_headline"}</Icon>
    </Fab>

  }

  return <div>
    <Container style={{ paddingLeft: screen700 ? "240px" : "0px", position: "relative", paddingTop: "100px" }}>
      {mobileOpenMenuButton}
      <div className="docMenu" style={menuStyle} >
        <DocumentationMenu currentSection={props.hash} hierarchy={hierarchy} onLinkClick={() => setmobileMenuOpen(false)} />
      </div>
      <Paper style={docStyle}>
        <div dangerouslySetInnerHTML={{ __html: content }}>
        </div>
      </Paper>
      <Footer />
    </Container>

  </div>

}
