php
<?php
// Exit if accessed directly.
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Adds the settings page to the WordPress admin menu.
 */
function certmagic_agent_settings_page() {
    add_options_page(
        'CertMagic Agent Settings', // Page title
        'CertMagic Agent',         // Menu title
        'manage_options',          // Capability
        'certmagic-agent-settings', // Menu slug
        'certmagic_agent_settings_page_content' // Callback function to display the page
    );
}
add_action('admin_menu', 'certmagic_agent_settings_page');

/**
 * Displays the content of the settings page.
 */
function certmagic_agent_settings_page_content() {
    ?>
    <div class="wrap">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <form method="post" action="options.php">
            <?php
            settings_fields('certmagic_agent_settings_group');
            do_settings_sections('certmagic-agent-settings');
            submit_button();
            ?>
        </form>
    </div>
    <?php
}

/**
 * Registers the settings fields.
 */
function certmagic_agent_register_settings() {
    add_settings_section(
        'certmagic_agent_main_section', // Section ID
        '', // Title (leave empty for no title)
        '', // Callback function (leave empty for no content)
        'certmagic-agent-settings' // Page
    );

    add_settings_field(
        'certmagic_agent_domain', // Field ID
        'Domain', // Field title
        'certmagic_agent_domain_callback', // Callback function
        'certmagic-agent-settings', // Page
        'certmagic_agent_main_section' // Section
    );

    add_settings_field(
        'certmagic_agent_instructions', // Field ID
        'Instructions', // Field title
        'certmagic_agent_instructions_callback', // Callback function
        'certmagic-agent-settings', // Page
        'certmagic_agent_main_section' // Section
    );

    register_setting('certmagic_agent_settings_group', 'certmagic_agent_domain');
    register_setting('certmagic_agent_settings_group', 'certmagic_agent_instructions');
}
add_action('admin_init', 'certmagic_agent_register_settings');

/**
 * Callback function for the domain input field.
 */
function certmagic_agent_domain_callback() {
    $domain = get_option('certmagic_agent_domain');
    echo '<input type="text" id="certmagic_agent_domain" name="certmagic_agent_domain" value="' . esc_attr($domain) . '" />';
}

/**
 * Callback function for the instructions textarea.
 */
function certmagic_agent_instructions_callback() {
    $instructions = get_option('certmagic_agent_instructions');
    $default_instructions = "To use the CertMagic Agent, follow these steps:\n" .
                           "1. Download the 'light-agent.php' file from the CertMagic website.\n" .
                           "2. Upload it to the root directory of your server.\n" .
                           "3. Ensure that the .well-known/acme-challenge directory is created in the root directory of your server.\n" .
                           "4. Make sure the 'light-agent.php' script has permissions to create files in the '.well-known/acme-challenge/' directory.\n" .
                           "5. After adding the certificate in CertMagic, the challenge file will be automatically deleted.\n".
                           "6. Copy the provided URL from the CertMagic page and paste it into the agent form.\n";
    echo '<textarea id="certmagic_agent_instructions" name="certmagic_agent_instructions" rows="20" cols="80">' . esc_textarea($instructions ? $instructions : $default_instructions) . '</textarea>';
}
?>