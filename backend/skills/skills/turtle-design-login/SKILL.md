# Skill: Design Login Page Component

**Agent:** TURTLE (UI/UX Designer)  
**Category:** Frontend Design  
**Complexity:** Intermediate  
**Estimated Time:** 1.5-2 seconds  
**Success Rate Target:** 95%+

---

## Purpose
Generates a beautiful, accessible, production-ready login page component with:
- Modern, responsive design
- Accessibility (WCAG AAA compliant)
- Form validation
- Error handling
- Password strength indicators
- Social login options
- Dark mode support

---

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| framework | string | yes | React, Vue, or Svelte |
| theme | string | yes | modern, minimal, bold, elegant |
| brandColors | array | yes | Primary and accent colors |
| withSocial | boolean | no | Include Google/GitHub login (default: true) |
| withMFA | boolean | no | Include MFA setup option (default: false) |
| accessibility | string | no | WCAG AA or AAA (default: AAA) |

---

## Steps

### Step 1: Design Layout
- Create responsive grid layout
- Design form fields and spacing
- Plan accent areas
- Optimize mobile experience

### Step 2: Build Component Structure
- Create main login form component
- Add form input components
- Create error message display
- Build submit button with states

### Step 3: Add Interactions
- Form validation on blur/submit
- Error state animations
- Loading state during submission
- Password visibility toggle
- "Remember me" functionality

### Step 4: Implement Accessibility
- Add proper ARIA labels
- Ensure color contrast (WCAG AAA)
- Keyboard navigation support
- Focus visible indicators
- Screen reader optimization

### Step 5: Create Styles
- Define CSS module or Tailwind
- Implement dark mode
- Add responsive breakpoints
- Create hover/focus states
- Add animations and transitions

### Step 6: Add Features
- Social login integration
- Password strength indicator
- "Forgot password" link
- Sign up link
- Terms of service link

---

## Outputs

```javascript
{
  "componentCode": "// React/Vue/Svelte component",
  "styles": "// CSS or Tailwind styles",
  "tests": "// Component tests",
  "accessibility": "// WCAG compliance report",
  "figmaLink": "// Design in Figma (if available)",
  "documentation": "// Component usage guide"
}
```

---

## Success Criteria
✓ Component renders without errors  
✓ Form validation works correctly  
✓ Mobile responsive (320px - 2560px)  
✓ WCAG AAA compliant  
✓ Accessible via keyboard only  
✓ Dark mode switches correctly  
✓ All interactions smooth and clear

---

## Common Failures & Recovery
- **Color contrast fails:** Adjust colors for WCAG AAA
- **Mobile layout breaks:** Increase touch target sizes
- **Animation too fast:** Reduce for accessibility
- **Focus indicators invisible:** Add visible focus rings

---

## Performance Notes
- Component size: ~8KB gzipped
- Render time: <50ms
- CSS variables: 12 (colors, spacing, timing)
- No external dependencies required

