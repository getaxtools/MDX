# Math

Inline links and HTML in math: $\href{javascript:alert(1)}{click}$ and $\url{javascript:alert(2)}$.

Raw HTML pretending to be math: <span class="mdx-math-inline" onclick="alert(3)">x</span>

Markup inside math: $<img src=x onerror=alert(4)>$ and $$<script>alert(5)</script>$$

$$
\htmlStyle{background:url(https://example.com/track.png)}{x}
\includegraphics{https://example.com/track.png}
$$

Expansion bomb: $\def\a{\a\a}\a$

```mermaid
graph TD
  A["<img src=x onerror=alert(6)>"] --> B
  click A "javascript:alert(7)"
  click B call alert(8)
```

<pre class="mdx-mermaid"><code>graph TD; A-->B</code><script>alert(9)</script></pre>
