import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { Music2, Users, Zap, Heart } from "lucide-react";

const About = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              About <span className="gradient-text">Practice Studio</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Empowering musicians with AI-driven tools to enhance their practice experience
            </p>
          </div>

          {/* Mission Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-8 mb-8"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Music2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-3">Our Mission</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Practice Studio was built with a simple goal: make professional-grade music 
                  practice tools accessible to everyone. Whether you're a beginner learning 
                  your first chords or a seasoned musician perfecting your technique, our 
                  AI-powered tools are designed to accelerate your progress.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="glass-card rounded-xl p-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Zap className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">AI-Powered Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    Cutting-edge machine learning algorithms analyze your playing in real-time, 
                    providing instant feedback to help you improve faster.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="glass-card rounded-xl p-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-success/10">
                  <Users className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Built for Musicians</h3>
                  <p className="text-sm text-muted-foreground">
                    Designed by musicians, for musicians. Every feature is crafted with 
                    real practice needs in mind.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="glass-card rounded-xl p-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Free to Use</h3>
                  <p className="text-sm text-muted-foreground">
                    All core features are completely free. We believe great practice 
                    tools should be accessible to everyone.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="glass-card rounded-xl p-6"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Music2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Multi-Instrument Support</h3>
                  <p className="text-sm text-muted-foreground">
                    From guitar to keyboard, our tools support multiple instruments 
                    and help bridge the gap between them.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Contact Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-xl font-semibold mb-4">Get in Touch</h2>
            <p className="text-muted-foreground mb-4">
              Have questions or feedback? We'd love to hear from you.
            </p>
            <p className="text-primary font-medium">hello@practicestudio.app</p>
          </motion.div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default About;
