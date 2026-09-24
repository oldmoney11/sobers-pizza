window.RichRepublicConfig = Object.freeze({
    supabaseUrl: "https://inthadecmxmbqexufzpe.supabase.co",
    supabasePublishableKey: "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80",
    sobersSlug: "sobers-pizza",
    customerAppBaseUrl: "https://soberspizza.com/"
});

window.RichRepublicSupabase = window.supabase.createClient(
    window.RichRepublicConfig.supabaseUrl,
    window.RichRepublicConfig.supabasePublishableKey
);
