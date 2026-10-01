window.RichRepublicConfig = Object.freeze({
    supabaseUrl: "https://inthadecmxmbqexufzpe.supabase.co",
    supabasePublishableKey: "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80",
    sobersSlug: "sobers-pizza",
    // The customer app lives one level above /admin/ on every environment,
    // including the owner preview and the final custom domain.
    customerAppBaseUrl: new URL("../", window.location.href).href
});

window.RichRepublicSupabase = window.supabase.createClient(
    window.RichRepublicConfig.supabaseUrl,
    window.RichRepublicConfig.supabasePublishableKey
);
