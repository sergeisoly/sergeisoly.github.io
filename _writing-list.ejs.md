```{=html}
<% const visible = templateParams?.limit ? items.slice(0, templateParams.limit) : items; %>
<% if (visible.length === 0 && !templateParams?.home) { %>
<p class="writing-empty">No posts yet.</p>
<% } else if (visible.length) { %>
<% if (templateParams?.home) { %><h2>Recent writing</h2><% } %>
<div class="writing-entries">
<% for (const item of visible) { %>
<article class="writing-entry">
<p class="entry-meta"><% if (item.date) { %><span><%- item.date %></span> · <% } %><span><%- item.kind || 'Note' %></span><% if (item.draft) { %> · Draft<% } %></p>
<% const heading = templateParams?.home ? "h3" : "h2"; %>
<<%= heading %>><a href="<%- item.path %>"><%- item.title %></a></<%= heading %>>
<% if (item.description) { %><p><%- item.description %></p><% } %>
<% if (item.categories && item.categories.length) { %><p class="entry-topics"><%- item.categories.join(' · ') %></p><% } %>
</article>
<% } %>
</div>
<% if (templateParams?.home) { %><p><a class="section-link" href="/writing.html">All writing</a></p><% } %>
<% } %>
```
