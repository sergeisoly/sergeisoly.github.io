```{=html}
<% const visible = templateParams?.limit ? items.slice(0, templateParams.limit) : items; %>
<% if (visible.length === 0 && !templateParams?.home) { %>
<p class="writing-empty">No posts yet.</p>
<% } else if (visible.length) { %>
<% if (templateParams?.home) { %><h2>Recent posts</h2><% } %>
<div class="writing-entries list">
<% for (const item of visible) { %>
<article class="writing-entry" data-categories="<%= btoa(encodeURIComponent((item.categories || []).join(','))) %>">
<p class="entry-meta"><% if (item.date) { %><span><%- item.date %></span><% } %><% if (item.draft) { %> · Draft<% } %></p>
<% const heading = templateParams?.home ? "h3" : "h2"; %>
<<%= heading %> class="listing-title"><a href="<%- item.path %>"><%- item.title %></a></<%= heading %>>
<% if (item.description) { %><p><%- item.description %></p><% } %>
<% if (item.categories && item.categories.length) { %><p class="entry-topics"><%- item.categories.join(' · ') %></p><% } %>
</article>
<% } %>
</div>
<% if (templateParams?.home) { %><p><a class="section-link" href="/posts.html">All posts</a></p><% } %>
<% } %>
<script>
// Quarto applies nonempty category hashes; clear the filter when Back removes one.
window.addEventListener("hashchange", () => {
  if (!new URLSearchParams(location.hash.slice(1)).get("category")) {
    Object.values(window["quarto-listings"] || {}).forEach(list => list.filter());
  }
});
</script>
```
