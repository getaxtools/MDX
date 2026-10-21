# Extended syntax

Footnote with a hostile label.[^<img src=x onerror=alert(1)>]

[^<img src=x onerror=alert(1)>]: <script>alert(1)</script> and [a link](javascript:alert(1)).

Inline footnote.^[<svg onload=alert(1)>]

> [!NOTE]
> <img src="https://example.com/pixel.png" onerror="alert(1)"> inside an alert.

> [!WARNING]
> <a href="vbscript:msgbox(1)" style="color:red">styled</a>

*[XSS]: <script>alert(1)</script>" onmouseover="alert(1)

XSS in an abbreviation.

Term with <iframe src="https://example.com"></iframe>
: Definition with <object data="x.swf"></object>

H~<script>alert(1)</script>~O and x^<b onclick=alert(1)>2</b>^ and ==<style>body{}</style>==

:rocket:<script>alert(1)</script>

<div id="fn1">clobbers a footnote name</div>
<a id="fnref1" href="#x">clobbers a footnote reference</a>
