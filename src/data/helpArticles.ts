import type { LucideIcon } from "lucide-react";
import {
  Film,
  Compass,
  MessageCircle,
  User,
  Shield,
  Rocket,
} from "lucide-react";

export type HelpCategory = {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: LucideIcon;
};

export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  keywords: string[];
};

export const categories: HelpCategory[] = [
  {
    slug: "stories-and-vibes",
    name: "Stories and Vibes",
    nameAr: "القصص والفايبز",
    description: "Learn about stories, interactive tools, reactions, and the Vibes experience.",
    descriptionAr: "تعرف على القصص والأدوات التفاعلية وردود الفعل وتجربة الفايبز.",
    icon: Film,
  },
  {
    slug: "feed-and-discovery",
    name: "Feed and Discovery",
    nameAr: "الخلاصة والاكتشاف",
    description: "Explore your personalized feed, post interactions, and content discovery.",
    descriptionAr: "استكشف خلاصتك المخصصة وتفاعلات المنشورات واكتشاف المحتوى.",
    icon: Compass,
  },
  {
    slug: "messaging",
    name: "Messaging",
    nameAr: "المراسلة",
    description: "Send messages, share posts, and reply to stories seamlessly.",
    descriptionAr: "أرسل رسائل وشارك المنشورات ورد على القصص بسلاسة.",
    icon: MessageCircle,
  },
  {
    slug: "account-and-profile",
    name: "Account and Profile",
    nameAr: "الحساب والملف الشخصي",
    description: "Manage your account, switch profiles, and customize your identity.",
    descriptionAr: "أدر حسابك وبدّل بين الملفات الشخصية وخصّص هويتك.",
    icon: User,
  },
  {
    slug: "privacy-and-safety",
    name: "Privacy and Safety",
    nameAr: "الخصوصية والأمان",
    description: "Control who sees your content and keep your account secure.",
    descriptionAr: "تحكم في من يرى محتواك وحافظ على أمان حسابك.",
    icon: Shield,
  },
  {
    slug: "getting-started",
    name: "Getting Started",
    nameAr: "البدء",
    description: "New to Vibo? Learn the basics and start exploring.",
    descriptionAr: "جديد على فايبو؟ تعلم الأساسيات وابدأ الاستكشاف.",
    icon: Rocket,
  },
];

export const articles: HelpArticle[] = [
  // --- Stories and Vibes ---
  {
    id: "interactive-story-tools",
    category: "stories-and-vibes",
    title: "Interactive story tools",
    titleAr: "أدوات القصة التفاعلية",
    body: `Vibo stories come with built-in interactive tools that help you connect with your audience.\n\nYou can add **polls** to let viewers vote, **questions** to collect open responses, **quizzes** to test knowledge, **countdowns** to build anticipation, and **"Add Yours"** prompts to start shared story chains.\n\nTo use any of these:\n1. Open the story editor.\n2. Tap the sticker icon at the top.\n3. Choose the interactive tool you want.\n4. Customize the prompt and post your story.`,
    bodyAr: `تأتي قصص فايبو بأدوات تفاعلية مدمجة تساعدك على التواصل مع جمهورك.\n\nيمكنك إضافة **استطلاعات** للتصويت، و**أسئلة** لجمع الردود، و**اختبارات** لاختبار المعرفة، و**عدّات تنازلية** لبناء الترقب، و**"أضف لديك"** لبدء سلاسل قصص مشتركة.\n\nلاستخدام أي منها:\n1. افتح محرر القصة.\n2. اضغط على أيقونة الملصقات في الأعلى.\n3. اختر الأداة التي تريدها.\n4. خصّص النص وانشر قصتك.`,
    keywords: ["polls", "questions", "quizzes", "countdown", "add yours", "stickers", "interactive"],
  },
  {
    id: "live-reactions",
    category: "stories-and-vibes",
    title: "Live reactions on stories",
    titleAr: "ردود الفعل الحية على القصص",
    body: `When you view someone's story, you can react instantly with emojis that appear in real time.\n\nThis makes interactions feel more alive and personal. Simply tap the emoji bar at the bottom of a story to send a reaction. The story creator will see your reaction as it happens.`,
    bodyAr: `عند مشاهدة قصة شخص ما، يمكنك التفاعل فوراً بإيموجي يظهر في الوقت الحقيقي.\n\nهذا يجعل التفاعلات أكثر حيوية. ببساطة اضغط على شريط الإيموجي أسفل القصة لإرسال تفاعل. سيرى صاحب القصة تفاعلك فوراً.`,
    keywords: ["reactions", "emoji", "stories", "real time", "live"],
  },
  {
    id: "story-replies",
    category: "stories-and-vibes",
    title: "Smart story replies",
    titleAr: "ردود القصة الذكية",
    body: `You can send quick messages or reactions directly from any story. Swipe up or tap the message field at the bottom of a story to type your reply.\n\nReplies go straight to the creator's inbox as a direct message, making conversation seamless.`,
    bodyAr: `يمكنك إرسال رسائل سريعة أو ردود فعل مباشرة من أي قصة. اسحب للأعلى أو اضغط على حقل الرسالة أسفل القصة لكتابة ردك.\n\nتذهب الردود مباشرة إلى صندوق رسائل المبدع كرسالة خاصة.`,
    keywords: ["reply", "story", "message", "swipe", "direct message"],
  },
  {
    id: "story-editing",
    category: "stories-and-vibes",
    title: "Creative story editing",
    titleAr: "تحرير القصة الإبداعي",
    body: `Vibo's story editor lets you customize every detail.\n\n**Text**: Add text overlays with different fonts, colors, and sizes.\n**Drawing**: Sketch over your photo or video with a variety of brush styles.\n**Filters**: Apply visual filters to change the mood of your content.\n**Stickers**: Use stickers, GIFs, and interactive elements.\n\nAll tools are accessible from the top toolbar after capturing or selecting your media.`,
    bodyAr: `يتيح لك محرر قصص فايبو تخصيص كل تفصيل.\n\n**النص**: أضف نصوصاً بخطوط وألوان وأحجام مختلفة.\n**الرسم**: ارسم فوق صورتك أو فيديوك بأنماط فرش متنوعة.\n**الفلاتر**: طبّق فلاتر بصرية لتغيير مزاج محتواك.\n**الملصقات**: استخدم ملصقات وصور متحركة وعناصر تفاعلية.`,
    keywords: ["edit", "text", "draw", "filter", "sticker", "story", "customize"],
  },
  {
    id: "add-yours-trends",
    category: "stories-and-vibes",
    title: "Interactive trends with Add Yours",
    titleAr: "الترندات التفاعلية مع أضف لديك",
    body: `"Add Yours" is a shared story prompt that lets you join a growing chain. When you see an "Add Yours" sticker on someone's story, tap it to contribute your own version.\n\nYou can also start your own "Add Yours" prompt from the sticker tray in the story editor. Your prompt will appear on your story and others can join.`,
    bodyAr: `"أضف لديك" هو طلب مشترك يتيح لك الانضمام إلى سلسلة متنامية. عندما ترى ملصق "أضف لديك" على قصة شخص ما، اضغط عليه لإضافة نسختك.\n\nيمكنك أيضاً بدء طلبك الخاص من درج الملصقات في محرر القصة.`,
    keywords: ["add yours", "trend", "chain", "prompt", "story"],
  },
  {
    id: "vibes-experience",
    category: "stories-and-vibes",
    title: 'Full screen "Vibes" experience',
    titleAr: 'تجربة "الفايبز" بملء الشاشة',
    body: `Vibes is Vibo's immersive, full screen content view. It is designed for smooth, scrollable discovery where you can watch and explore content without distractions.\n\nSwipe up to browse through Vibes. Tap the heart to like, the comment icon to engage, or the share icon to send a Vibe to a friend.`,
    bodyAr: `الفايبز هو العرض الغامر بملء الشاشة في فايبو. مصمم للاكتشاف السلس حيث يمكنك المشاهدة والاستكشاف بلا تشتيت.\n\nاسحب للأعلى لتصفح الفايبز. اضغط القلب للإعجاب، أيقونة التعليق للتفاعل، أو أيقونة المشاركة لإرسال فايب لصديق.`,
    keywords: ["vibes", "full screen", "scroll", "discover", "immersive", "video"],
  },

  // --- Feed and Discovery ---
  {
    id: "personalized-feed",
    category: "feed-and-discovery",
    title: "Your personalized feed",
    titleAr: "خلاصتك المخصصة",
    body: `Vibo builds a feed tailored to your interests. The more you interact with content — liking, commenting, sharing, and following — the better your feed becomes at showing you what matters.\n\nYour feed includes posts from people you follow as well as suggested content based on your activity.`,
    bodyAr: `يبني فايبو خلاصة مصممة حسب اهتماماتك. كلما تفاعلت مع المحتوى — بالإعجاب والتعليق والمشاركة والمتابعة — تصبح خلاصتك أفضل في عرض ما يهمك.\n\nتشمل خلاصتك منشورات من الأشخاص الذين تتابعهم ومحتوى مقترح بناءً على نشاطك.`,
    keywords: ["feed", "personalized", "algorithm", "discover", "for you"],
  },
  {
    id: "post-interactions",
    category: "feed-and-discovery",
    title: "Interacting with posts",
    titleAr: "التفاعل مع المنشورات",
    body: `You can like, comment, and share any post on Vibo.\n\n**Like**: Tap the heart icon below a post.\n**Comment**: Tap the comment bubble to write a reply.\n**Share**: Tap the share icon to send the post to a friend via direct message or to your story.\n\nAll interactions are designed to feel natural and responsive.`,
    bodyAr: `يمكنك الإعجاب والتعليق والمشاركة على أي منشور في فايبو.\n\n**إعجاب**: اضغط أيقونة القلب أسفل المنشور.\n**تعليق**: اضغط فقاعة التعليق لكتابة رد.\n**مشاركة**: اضغط أيقونة المشاركة لإرسال المنشور لصديق عبر رسالة خاصة أو إلى قصتك.`,
    keywords: ["like", "comment", "share", "post", "interact", "heart"],
  },
  {
    id: "smooth-navigation",
    category: "feed-and-discovery",
    title: "Navigating Vibo",
    titleAr: "التنقل في فايبو",
    body: `Vibo is built for fast, fluid navigation. The bottom tab bar gives you instant access to:\n\n- **Home**: Your main feed.\n- **Discover**: Explore trending content and new creators.\n- **Create**: Capture a photo, video, or story.\n- **Messages**: Your conversations.\n- **Profile**: Your content and settings.\n\nSwipe gestures and transitions are smooth throughout the app.`,
    bodyAr: `فايبو مبني للتنقل السريع والسلس. شريط التبويب السفلي يمنحك وصولاً فورياً إلى:\n\n- **الرئيسية**: خلاصتك الأساسية.\n- **اكتشف**: استكشف المحتوى الرائج والمبدعين الجدد.\n- **إنشاء**: التقط صورة أو فيديو أو قصة.\n- **الرسائل**: محادثاتك.\n- **الملف الشخصي**: محتواك وإعداداتك.`,
    keywords: ["navigation", "tabs", "home", "discover", "create", "profile", "swipe"],
  },

  // --- Messaging ---
  {
    id: "real-time-messaging",
    category: "messaging",
    title: "Real time messaging",
    titleAr: "المراسلة في الوقت الحقيقي",
    body: `Vibo includes a simple, responsive messaging system. Messages are delivered in real time so conversations flow naturally.\n\nYou can send text, photos, videos, and reactions in any chat. Group conversations are also supported.`,
    bodyAr: `يتضمن فايبو نظام مراسلة بسيط وسريع الاستجابة. تُسلّم الرسائل في الوقت الحقيقي لتتدفق المحادثات بشكل طبيعي.\n\nيمكنك إرسال نصوص وصور وفيديوهات وردود فعل في أي محادثة. المحادثات الجماعية مدعومة أيضاً.`,
    keywords: ["message", "chat", "real time", "text", "group", "conversation"],
  },
  {
    id: "sharing-posts",
    category: "messaging",
    title: "Sharing posts with friends",
    titleAr: "مشاركة المنشورات مع الأصدقاء",
    body: `Found something great? Share it instantly. Tap the share icon on any post and pick a friend or group to send it to.\n\nThe shared post appears as a preview in your chat so both of you can see and discuss it.`,
    bodyAr: `وجدت شيئاً رائعاً؟ شاركه فوراً. اضغط أيقونة المشاركة على أي منشور واختر صديقاً أو مجموعة لإرساله إليهم.\n\nيظهر المنشور المشارك كمعاينة في المحادثة ليتمكن الطرفان من رؤيته ومناقشته.`,
    keywords: ["share", "send", "post", "friend", "chat", "message"],
  },

  // --- Account and Profile ---
  {
    id: "multi-account",
    category: "account-and-profile",
    title: "Multi account support",
    titleAr: "دعم الحسابات المتعددة",
    body: `Vibo lets you add and switch between multiple accounts without signing out.\n\nTo add an account:\n1. Go to your profile.\n2. Tap your username at the top.\n3. Select "Add Account" and sign in with your other credentials.\n\nSwitch between accounts from the same menu at any time.`,
    bodyAr: `يتيح لك فايبو إضافة حسابات متعددة والتبديل بينها دون تسجيل الخروج.\n\nلإضافة حساب:\n1. اذهب إلى ملفك الشخصي.\n2. اضغط على اسم المستخدم في الأعلى.\n3. اختر "إضافة حساب" وسجّل الدخول ببياناتك الأخرى.\n\nبدّل بين الحسابات من نفس القائمة في أي وقت.`,
    keywords: ["multi account", "switch", "add account", "login", "multiple"],
  },
  {
    id: "profile-customization",
    category: "account-and-profile",
    title: "Customize your profile",
    titleAr: "خصّص ملفك الشخصي",
    body: `Make your profile yours. You can update:\n\n- **Profile photo**: Tap your avatar to upload a new image.\n- **Banner**: Add a banner image at the top of your profile.\n- **Bio**: Write a short description about yourself.\n- **Name and username**: Edit from the profile settings.\n\nYour profile is how others discover and connect with you.`,
    bodyAr: `اجعل ملفك الشخصي يعبّر عنك. يمكنك تحديث:\n\n- **صورة الملف الشخصي**: اضغط صورتك لرفع صورة جديدة.\n- **البانر**: أضف صورة بانر أعلى ملفك الشخصي.\n- **النبذة**: اكتب وصفاً قصيراً عن نفسك.\n- **الاسم واسم المستخدم**: عدّلهما من إعدادات الملف الشخصي.`,
    keywords: ["profile", "photo", "banner", "bio", "username", "customize", "avatar"],
  },
  {
    id: "story-viewer",
    category: "account-and-profile",
    title: "Viewing stories",
    titleAr: "مشاهدة القصص",
    body: `Stories appear in a clean, focused layout at the top of your feed. Tap any profile circle to start watching.\n\nSwipe left to move to the next person's story. Tap the left or right side of the screen to skip forward or go back within a single story.`,
    bodyAr: `تظهر القصص بتصميم نظيف ومركّز أعلى خلاصتك. اضغط على أي دائرة ملف شخصي لبدء المشاهدة.\n\nاسحب يساراً للانتقال لقصة الشخص التالي. اضغط الجانب الأيمن أو الأيسر من الشاشة للتخطي أو العودة داخل قصة واحدة.`,
    keywords: ["story", "viewer", "watch", "swipe", "tap", "view"],
  },

  // --- Privacy and Safety ---
  {
    id: "reporting-content",
    category: "privacy-and-safety",
    title: "Reporting content",
    titleAr: "الإبلاغ عن محتوى",
    body: `If you see content that violates Vibo's community guidelines, you can report it.\n\n1. Tap the three dots (or long press) on the post, story, or message.\n2. Select "Report."\n3. Choose a reason from the list.\n\nOur team reviews reports and takes action to keep the community safe.`,
    bodyAr: `إذا رأيت محتوى ينتهك إرشادات مجتمع فايبو، يمكنك الإبلاغ عنه.\n\n1. اضغط على النقاط الثلاث (أو اضغط مطولاً) على المنشور أو القصة أو الرسالة.\n2. اختر "إبلاغ."\n3. اختر سبباً من القائمة.\n\nيراجع فريقنا البلاغات ويتخذ إجراءات للحفاظ على أمان المجتمع.`,
    keywords: ["report", "content", "violate", "guidelines", "safety"],
  },
  {
    id: "blocking-accounts",
    category: "privacy-and-safety",
    title: "Blocking and restricting accounts",
    titleAr: "حظر وتقييد الحسابات",
    body: `You can block or restrict any account on Vibo.\n\n**Block**: The person cannot see your profile, posts, or stories. They cannot message you.\n**Restrict**: Their comments on your posts are only visible to them. Messages go to a filtered inbox.\n\nTo block or restrict: visit the person's profile, tap the three dots, and choose your preference.`,
    bodyAr: `يمكنك حظر أو تقييد أي حساب على فايبو.\n\n**حظر**: لن يتمكن الشخص من رؤية ملفك الشخصي أو منشوراتك أو قصصك. لن يستطيع مراسلتك.\n**تقييد**: تعليقاته على منشوراتك تظهر له فقط. الرسائل تذهب إلى صندوق مفلتر.\n\nللحظر أو التقييد: زر ملف الشخص الشخصي، اضغط النقاط الثلاث، واختر تفضيلك.`,
    keywords: ["block", "restrict", "account", "privacy", "mute"],
  },
  {
    id: "content-controls",
    category: "privacy-and-safety",
    title: "Content and privacy controls",
    titleAr: "أدوات التحكم بالمحتوى والخصوصية",
    body: `Vibo gives you control over your experience:\n\n- **Private account**: Only approved followers can see your posts and stories.\n- **Comment filters**: Block specific words from appearing in comments.\n- **Story sharing**: Choose who can share your stories.\n- **Activity status**: Show or hide when you were last active.\n\nAll settings are available under Profile > Settings > Privacy.`,
    bodyAr: `يمنحك فايبو التحكم في تجربتك:\n\n- **حساب خاص**: يمكن فقط للمتابعين الموافق عليهم رؤية منشوراتك وقصصك.\n- **فلاتر التعليقات**: امنع كلمات معينة من الظهور في التعليقات.\n- **مشاركة القصص**: اختر من يمكنه مشاركة قصصك.\n- **حالة النشاط**: أظهر أو أخفِ آخر ظهور لك.\n\nجميع الإعدادات متاحة تحت الملف الشخصي > الإعدادات > الخصوصية.`,
    keywords: ["privacy", "private", "control", "filter", "comment", "activity", "settings"],
  },

  // --- Getting Started ---
  {
    id: "creating-account",
    category: "getting-started",
    title: "Creating your Vibo account",
    titleAr: "إنشاء حسابك على فايبو",
    body: `Getting started with Vibo is simple:\n\n1. Download the Vibo app.\n2. Tap "Sign Up."\n3. Enter your email or phone number.\n4. Choose a username and password.\n5. Complete your profile with a photo and bio.\n\nYou are ready to explore, create, and connect.`,
    bodyAr: `البدء مع فايبو بسيط:\n\n1. حمّل تطبيق فايبو.\n2. اضغط "إنشاء حساب."\n3. أدخل بريدك الإلكتروني أو رقم هاتفك.\n4. اختر اسم مستخدم وكلمة مرور.\n5. أكمل ملفك الشخصي بصورة ونبذة.\n\nأنت جاهز للاستكشاف والإنشاء والتواصل.`,
    keywords: ["create", "account", "sign up", "register", "new", "start"],
  },
  {
    id: "app-basics",
    category: "getting-started",
    title: "Vibo app basics",
    titleAr: "أساسيات تطبيق فايبو",
    body: `Vibo is designed to be intuitive. Here are the essentials:\n\n- **Feed**: Scroll through posts from people you follow and suggested content.\n- **Stories**: Tap profile circles at the top to watch stories.\n- **Vibes**: Swipe into full screen video discovery.\n- **Create**: Use the center button to post photos, videos, or stories.\n- **Messages**: Chat with friends in real time.\n\nThe app features a clean, modern design focused on clarity and ease of use.`,
    bodyAr: `فايبو مصمم ليكون بديهياً. إليك الأساسيات:\n\n- **الخلاصة**: تصفح منشورات من تتابعهم ومحتوى مقترح.\n- **القصص**: اضغط دوائر الملفات الشخصية في الأعلى لمشاهدة القصص.\n- **الفايبز**: اسحب للدخول في اكتشاف فيديو بملء الشاشة.\n- **إنشاء**: استخدم الزر المركزي لنشر صور أو فيديوهات أو قصص.\n- **الرسائل**: تحدث مع أصدقائك في الوقت الحقيقي.\n\nيتميز التطبيق بتصميم نظيف وعصري يركز على الوضوح وسهولة الاستخدام.`,
    keywords: ["basics", "how to", "getting started", "feed", "stories", "vibes", "create", "messages"],
  },
  {
    id: "clean-design",
    category: "getting-started",
    title: "Clean and modern design",
    titleAr: "تصميم نظيف وعصري",
    body: `Vibo features a simple, polished interface designed for clarity, speed, and ease of use.\n\nEvery screen is optimized for readability with generous spacing, consistent typography, and smooth animations. Navigation is fast and fluid so you spend more time enjoying content and less time figuring out the app.`,
    bodyAr: `يتميز فايبو بواجهة بسيطة ومصقولة مصممة للوضوح والسرعة وسهولة الاستخدام.\n\nكل شاشة محسّنة للقراءة بمسافات واسعة وخطوط متسقة ورسوم متحركة سلسة. التنقل سريع وسلس لتقضي وقتاً أطول في الاستمتاع بالمحتوى.`,
    keywords: ["design", "interface", "ui", "clean", "modern", "simple"],
  },
];

export function getCategoryBySlug(slug: string): HelpCategory | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getArticlesByCategory(categorySlug: string): HelpArticle[] {
  return articles.filter((a) => a.category === categorySlug);
}

export function getArticleById(id: string): HelpArticle | undefined {
  return articles.find((a) => a.id === id);
}

export function searchArticles(query: string): HelpArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q)) ||
      a.body.toLowerCase().includes(q),
  );
}
