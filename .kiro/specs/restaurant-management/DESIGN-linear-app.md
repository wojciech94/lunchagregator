# Design System Inspired by Linear

## 1. Visual Theme & Atmosphere
Linear's interface is characterized by a sleek, dark aesthetic that emphasizes clarity and functionality. The use of high-contrast elements, combined with vibrant accent colors, creates a dynamic yet cohesive user experience. The overall design feels modern and tech-forward, appealing to teams focused on product development.

**Key Characteristics**
- Dark background with contrasting light text for readability.
- Vibrant accent colors like #6366f1 and #eb5757 for interactive elements.
- Clean, sans-serif typography with a focus on legibility.
- Subtle shadows and hover effects to enhance depth.
- Use of whitespace to separate content and improve focus.
- Consistent button styles that align with the brand's identity.

## 2. Color Palette & Roles

### **Primary**
- **Accent Blue (#6366f1)** — Used for primary actions and highlights.
- **Accent Red (#eb5757)** — Utilized for alerts and important notifications.
- **Accent Purple (#8b5cf6)** — Supports various interface elements.

### **Accent Colors**
- **Accent Light Blue (#5e6ad2)** — Secondary interactive elements.
- **Accent Dark (#0f1011)** — Background-dark for contrast against lighter elements.

### **Interactive**
- **Text Inverse (#f7f8f8)** — Used for text on dark backgrounds.
- **Text Secondary (#62666d)** — For secondary text and less prominent information.

### **Neutral Scale**
- **Background White (#ffffff)** — Primary background color for sections.
- **Neutral Light (#e5e5e6)** — Light fills and borders for subtle separation.
- **Neutral Dark (#08090a)** — Dark backgrounds for cards and sections.

### **Surface & Borders**
- **Border Color (#24282c)** — Used for subtle borders on input fields and cards.

## 3. Typography Rules
- **Font Family**: Inter Variable, with Berkeley Mono as a monospace fallback.
- **Hierarchy**:

| Role     | Font               | Size   | Weight | Line Height | Letter Spacing | Notes               |
|----------|--------------------|--------|--------|-------------|----------------|---------------------|
| Display  | Inter Variable      | 64px   | 700    | 1.2         | Normal         | Main headings        |
| H2       | Inter Variable      | 24px   | 700    | 1.2         | Normal         | Sub-headings         |
| H3       | Inter Variable      | 20px   | 400    | 1.5         | Normal         | Section titles       |
| Body     | Inter Variable      | 16px   | 400    | 1.5         | Normal         | Main text            |
| Small    | Inter Variable      | 15px   | 400    | 1.5         | Normal         | Smaller text         |

### **Principles**
- Focus on legibility with a sans-serif typeface.
- Use larger sizes for headings to create clear hierarchies.
- Maintain consistent line heights for comfortable reading.

## 4. Component Stylings

### Buttons
**Primary Button**
```css
.button-primary {
  background-color: #6366f1;
  color: #ffffff;
  font-size: 16px;
  font-weight: 400;
  padding: 12px 24px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.button-primary:hover {
  background-color: #5e6ad2;
}
```

**Secondary Button**
```css
.button-secondary {
  background-color: transparent;
  color: #62666d;
  border: 1px solid #62666d;
  font-size: 16px;
  font-weight: 400;
  padding: 12px 24px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.button-secondary:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
```

### Cards & Containers
**Standard Card**
```css
.card {
  background-color: #ffffff;
  border: 1px solid #e5e5e6;
  border-radius: 6px;
  box-shadow: rgba(0, 0, 0, 0.03) 0px 1.2px 0px 0px;
  padding: 16px;
  transition: filter 0.3s;
}

.card:hover {
  filter: brightness(110%);
}
```

### Inputs & Forms
**Text Input**
```css
.input-text {
  background-color: #ffffff;
  border: 1px solid #e5e5e6;
  border-radius: 4px;
  padding: 12px;
  font-size: 16px;
  color: #62666d;
}

.input-text:focus {
  border-color: #6366f1;
  outline: none;
}
```

### Navigation
**Top Navigation Bar**
```css
.navbar {
  background-color: #0f1011;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.navbar a {
  color: #f7f8f8;
  text-decoration: none;
  padding: 12px;
  transition: color 0.3s;
}

.navbar a:hover {
  color: #6366f1;
}
```

### Links
**Standard Link**
```css
.link {
  color: #6366f1;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}
```

### Badges
**Status Badge**
```css
.badge-success {
  background-color: #39b350;
  color: #ffffff;
  border-radius: 12px;
  padding: 4px 8px;
}

.badge-alert {
  background-color: #eb5757;
  color: #ffffff;
  border-radius: 12px;
  padding: 4px 8px;
}

.badge-info {
  background-color: #8b5cf6;
  color: #ffffff;
  border-radius: 12px;
  padding: 4px 8px;
}
```

## 5. Layout Principles
- **Spacing System**: Base unit 4px → 4, 8, 12, 16, 20, 24, 32.
  - **Usage Context**: 
    - 4px for small margins.
    - 8px for padding in buttons.
    - 12px for card spacing.
    - 16px for section padding.
    - 20px for larger elements.
    - 24px for main content spacing.
    - 32px for section breaks.

- **Grid & Container**
_Note: container widths and column counts are not extracted from the source. The values below are reasonable defaults inferred from the visible layout density._
  - Max Width: 1440px
  - Columns: 12
  - Gutter: 16px
  - Section Padding: 32px

- **Whitespace Philosophy**: Whitespace is used strategically to separate content and improve readability. Generous margins and padding create a clean, uncluttered interface.

- **Border Radius Scale**: 
  - 2px: Small buttons and inputs.
  - 4px: Standard buttons and cards.
  - 6px: Slightly rounded elements.
  - 12px: Containers and larger UI elements.
  - 50px: Circular elements.

## 6. Depth & Elevation
| Level | Treatment                                               | Use                      |
|-------|--------------------------------------------------------|--------------------------|
| z-0   | None                                                   | Base elements            |
| z-1   | rgba(0, 0, 0, 0.03) 0px 1.2px 0px 0px                | Cards                    |
| z-3   | rgba(0, 0, 0, 0.4) 0px 2px 4px 0px                   | Dropdowns                |
| z-100 | rgba(0, 0, 0, 0.2) 0px 0px 12px 0px inset             | Modals                   |

### Shadow Philosophy
Shadows are used to create depth and separation between elements. Subtle shadows enhance the perception of layers without overwhelming the visual hierarchy.

## 7. Do's and Don'ts

### Do's
- Use #6366f1 for primary buttons and links.
- Maintain 16px font size for body text for readability.
- Ensure at least 24px spacing between consecutive Cards.
- Apply a border radius of 4px for standard buttons.
- Use #f7f8f8 for text on dark backgrounds to ensure contrast.
- Use 32px padding for section breaks to enhance content separation.
- Keep text color #62666d for secondary text for clarity.
- Use rgba(0, 0, 0, 0.03) for subtle shadows on cards.

### Don'ts
- Never use #62666d on #f7f8f8 backgrounds; it fails AA contrast.
- Avoid using font sizes smaller than 16px for body text.
- Do not overcrowd elements; keep at least 20px between buttons.
- Avoid using a border radius larger than 12px for buttons.
- Never use #08090a for text on #ffffff backgrounds; it fails contrast.
- Do not apply shadows heavier than rgba(0, 0, 0, 0.4) for cards.
- Avoid using #eb5757 for normal text; reserve for alerts only.
- Never mix font weights within the same heading level.

## 8. Responsive Behavior
### **Breakpoints**
| Breakpoint Name      | Width   | Key Changes              |
|----------------------|---------|--------------------------|
| Mobile Small         | 600px   | Stack navigation items   |
| Mobile Large         | 640px   | Adjust button sizes      |
| Tablet               | 768px   | Change layout to grid    |
| Desktop              | 1280px  | Show full navigation     |
| Desktop Large        | 1440px  | Expand content areas     |

### **Touch Targets**
- Minimum button size: 44px x 44px.
- Minimum padding for touchable elements: 16px.

### **Collapsing Strategy**
- Navigation: Collapse into a hamburger menu on mobile.
- Cards: Stack vertically on smaller screens.
- Typography: Adjust font sizes down by 2px on mobile.
- Padding: Reduce section padding to 16px on mobile.

## 9. Agent Prompt Guide
- **Quick Color Reference**
  - Background: #ffffff
  - Accent Blue: #6366f1
  - Accent Red: #eb5757
  - Text: #62666d

- **Iteration Guide**
  1. Always use #6366f1 for primary actions.
  2. Maintain font sizes of 16px for body text.
  3. Use 4px, 8px, 12px, 16px, and 32px from the spacing scale.
  4. Keep border radius values to 4px for buttons.
  5. Ensure button heights are 48px for primary buttons.
  6. Use #f7f8f8 for text on dark backgrounds.
  7. Apply a shadow of rgba(0, 0, 0, 0.03) for cards.
  8. Use a gradient direction of 135deg for accent backgrounds.